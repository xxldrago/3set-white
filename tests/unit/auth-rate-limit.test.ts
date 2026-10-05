// CR-02 regression: the login lock must be IP-independent at the account
// level. Rotating the source IP (spoofed X-Forwarded-For) can no longer reset
// the account-wide counter, while the per-(email, ip) lock keeps working.
//
// Real local Postgres (`setwhite` per phase conventions); unique throwaway
// emails; every row created here is removed in beforeAll/afterAll.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  EMAIL_ONLY_IP,
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginAttempts,
} from "../../lib/auth-rate-limit";
import { prisma } from "../../lib/prisma";

const RUN = Date.now().toString(36);
const EMAIL_ROTATE = `phase6-rl-rotate-${RUN}@example.test`;
const EMAIL_SAME = `phase6-rl-same-${RUN}@example.test`;
const EMAIL_IPONLY = `phase6-rl-iponly-${RUN}@example.test`;
const EMAIL_RESET = `phase6-rl-reset-${RUN}@example.test`;
const EMAILS = [EMAIL_ROTATE, EMAIL_SAME, EMAIL_IPONLY, EMAIL_RESET];

async function cleanup(): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { email: { in: EMAILS } } });
}

describe("login rate limit (CR-02: per-email lock)", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("locks the account after five failures from five different IPs and denies a sixth from a new IP", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedLogin(EMAIL_ROTATE, `203.0.113.${i + 1}`);
    }

    const accountRow = await prisma.loginAttempt.findUnique({
      where: { email_ip: { email: EMAIL_ROTATE, ip: EMAIL_ONLY_IP } },
    });
    expect(accountRow?.attempts).toBe(5);
    expect(accountRow?.lockedUntil).not.toBeNull();

    // Yet another never-seen IP must NOT reset the lock.
    const gate = await checkLoginRateLimit(EMAIL_ROTATE, "203.0.113.200");
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterSec).toBeGreaterThan(0);
  });

  it("still engages the per-(email, ip) lock", async () => {
    const ip = "198.51.100.9";
    for (let i = 0; i < 5; i++) {
      await recordFailedLogin(EMAIL_SAME, ip);
    }

    const perIpRow = await prisma.loginAttempt.findUnique({
      where: { email_ip: { email: EMAIL_SAME, ip } },
    });
    expect(perIpRow?.lockedUntil).not.toBeNull();

    const gate = await checkLoginRateLimit(EMAIL_SAME, ip);
    expect(gate.allowed).toBe(false);
  });

  it("denies via a per-(email, ip) lock even without an account-wide row", async () => {
    const ip = "192.0.2.55";
    await prisma.loginAttempt.create({
      data: { email: EMAIL_IPONLY, ip, attempts: 5, lockedUntil: new Date(Date.now() + 60_000) },
    });

    const gate = await checkLoginRateLimit(EMAIL_IPONLY, ip);
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterSec).toBeGreaterThan(0);
  });

  it("resetLoginAttempts clears both the account and per-(email, ip) rows", async () => {
    const ip = "10.20.30.40";
    for (let i = 0; i < 3; i++) {
      await recordFailedLogin(EMAIL_RESET, ip);
    }

    const before = await prisma.loginAttempt.findMany({ where: { email: EMAIL_RESET } });
    expect(before.map((row) => row.ip).sort()).toEqual(["", ip].sort());

    await resetLoginAttempts(EMAIL_RESET, ip);

    const after = await prisma.loginAttempt.findMany({ where: { email: EMAIL_RESET } });
    expect(after).toHaveLength(0);
  });

  it("allows when no counter row exists", async () => {
    const gate = await checkLoginRateLimit(`phase6-rl-none-${RUN}@example.test`, "203.0.113.1");
    expect(gate.allowed).toBe(true);
  });
});
