// Phase 6 gap-closure (WR-02/WR-04, plan 06-13): registration is throttled per
// trusted client IP, and plus/dot aliases of one mailbox collapse to a single
// canonical account via `User.emailCanonical UNIQUE` — so a mailbox can mint
// neither extra accounts nor extra `email:{userId}` trials.
//
// Real `setwhite` DB, throwaway emails only. Each non-throttle vector presents
// its own `x-real-ip`; the throttle vector deliberately reuses ONE fixed IP so
// the per-key counter accumulates. Users + `LoginAttempt` rows (including the
// namespaced `__register__:` counters) are removed in beforeAll/afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as registerPOST } from "../../app/api/auth/email/register/route";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);
const PASSWORD = "alias-throwaway-123";

// Plus-tag suffix comes AFTER the run token, so the canonical (tag-stripped)
// value still carries the run token — rows from a crashed prior run can never
// collide with this run's canonical mailbox.
const ALIAS_PRIMARY = `alias-${RUN}+one@example.test`;
const ALIAS_SECOND = `alias-${RUN}+two@example.test`;
const ALIAS_CANON = `alias-${RUN}@example.test`;

// Gmail dot aliases: dots in the local part are insignificant.
const DOT_DOTTED = `dots.${RUN}@gmail.com`;
const DOT_PLAIN = `dots${RUN}@gmail.com`;
const DOT_CANON = `dots${RUN}@gmail.com`;

const PROBE_EMAILS = Array.from(
  { length: 8 },
  (_, i) => `phase6-register-probe-${RUN}-${i}@example.test`,
);

// Run-unique IP octets. `198.51.<run>.*` for the independent alias vectors,
// one fixed `203.0.<run>.250` for the accumulating throttle probe.
const IP_RUN = (Date.now() % 200) + 1;
const ALIAS_IP_PREFIX = `__register__:198.51.${IP_RUN}.`;
const PROBE_IP = `203.0.${IP_RUN}.250`;
const PROBE_PREFIX = `__register__:203.0.${IP_RUN}.250`;
let aliasIpCounter = 0;
function nextAliasIp(): string {
  aliasIpCounter += 1;
  return `198.51.${IP_RUN}.${aliasIpCounter}`;
}

function postRegister(email: string, ip: string): Promise<Response> {
  return registerPOST(
    new Request("http://localhost/api/auth/email/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
}

async function cleanup(): Promise<void> {
  const emails = [ALIAS_PRIMARY, ALIAS_SECOND, DOT_DOTTED, DOT_PLAIN, ...PROBE_EMAILS];
  await prisma.loginAttempt.deleteMany({
    where: {
      OR: [
        { email: { in: emails } },
        { email: { startsWith: ALIAS_IP_PREFIX } },
        { email: { startsWith: PROBE_PREFIX } },
      ],
    },
  });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

describe("registration alias collapse + throttle (WR-02/WR-04)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("a plus alias of an already-registered mailbox returns 409 and adds no row", async () => {
    const first = await postRegister(ALIAS_PRIMARY, nextAliasIp());
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });

    // The canonical identity is persisted (not just the raw email).
    const stored = await prisma.user.findUnique({
      where: { email: ALIAS_PRIMARY },
      select: { emailCanonical: true },
    });
    expect(stored?.emailCanonical).toBe(ALIAS_CANON);

    // The second alias collapses to the same canonical mailbox → 409.
    const alias = await postRegister(ALIAS_SECOND, nextAliasIp());
    expect(alias.status).toBe(409);
    expect(await alias.json()).toEqual({ error: "email_taken" });

    await expect(
      prisma.user.findUnique({ where: { email: ALIAS_SECOND } }),
    ).resolves.toBeNull();
    await expect(
      prisma.user.count({ where: { emailCanonical: ALIAS_CANON } }),
    ).resolves.toBe(1);
  });

  it("re-registering the exact same email returns 409", async () => {
    const again = await postRegister(ALIAS_PRIMARY, nextAliasIp());
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "email_taken" });
  });

  it("gmail dot aliases collapse to one canonical mailbox (409)", async () => {
    const dotted = await postRegister(DOT_DOTTED, nextAliasIp());
    expect(dotted.status).toBe(200);
    const dottedRow = await prisma.user.findUnique({
      where: { email: DOT_DOTTED },
      select: { emailCanonical: true },
    });
    expect(dottedRow?.emailCanonical).toBe(DOT_CANON);

    // `dots<run>@gmail.com` is the same canonical mailbox as `dots.<run>@`.
    const plain = await postRegister(DOT_PLAIN, nextAliasIp());
    expect(plain.status).toBe(409);
    expect(await plain.json()).toEqual({ error: "email_taken" });
  });

  it("registrations from one trusted IP beyond the cap return 429 with a numeric retryAfterSec", async () => {
    let lastStatus = 0;
    let lockBody: unknown = null;
    // Every probe call reuses PROBE_IP so the per-IP counter accumulates.
    for (const email of PROBE_EMAILS) {
      const res = await postRegister(email, PROBE_IP);
      lastStatus = res.status;
      if (res.status === 429) {
        lockBody = await res.json();
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(lastStatus).toBe(429);
    expect(lockBody).toEqual({
      error: "rate_limited",
      retryAfterSec: expect.any(Number),
    });
    expect((lockBody as { retryAfterSec: number }).retryAfterSec).toBeGreaterThan(0);
  });
});
