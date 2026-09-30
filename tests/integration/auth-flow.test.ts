// Tracer flow: one genuine Widget payload travels verify → one-time
// consume → users upsert → session cookie, and the row reads back.
// Fixture token is a throwaway (process.env.BOT_TOKEN for the run is a
// dummy, never a real bot token); replay rows + test user are cleaned up.
import { createHash, createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "../../app/api/auth/telegram/route";
import { SESSION_COOKIE, verifySession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

const TEST_TELEGRAM_ID = 200000001;

function signWidget(fields: Record<string, string | number>, token: string): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(token).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

function genuinePayload() {
  const token = process.env["BOT_TOKEN"];
  if (!token) throw new Error("BOT_TOKEN must be set (dummy throwaway OK)");
  const fields = {
    id: TEST_TELEGRAM_ID,
    first_name: "Tracer",
    username: "tracer_test",
    auth_date: Math.floor(Date.now() / 1000),
  };
  return { ...fields, hash: signWidget(fields, token) };
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TEST_TELEGRAM_ID) } });
  await prisma.replayCache.deleteMany();
}

function postJson(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("auth flow (Widget → session → users row)", () => {
  // One payload for the whole flow: the replay case must resend the exact
  // same hash (recomputing could roll auth_date by a second and change it).
  const payload = genuinePayload();

  beforeAll(cleanup);
  afterAll(cleanup);

  it("mints one session and persists exactly one users row per telegram id", async () => {
    const res = await postJson(payload);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");

    // Session round-trips to the same telegram id.
    const token = setCookie.split(";")[0]?.split("=")[1] ?? "";
    const secret = process.env["SESSION_SECRET"];
    if (!secret) throw new Error("SESSION_SECRET must be set (dummy throwaway OK)");
    await expect(verifySession(token, secret)).resolves.toBe(TEST_TELEGRAM_ID);

    // Persisted row reads back exactly once.
    const rows = await prisma.user.findMany({
      where: { telegramId: BigInt(TEST_TELEGRAM_ID) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.firstName).toBe("Tracer");
  });

  it("rejects the replayed payload without touching the row", async () => {
    const res = await postJson(payload);
    expect(res.status).toBe(401);
    const rows = await prisma.user.findMany({
      where: { telegramId: BigInt(TEST_TELEGRAM_ID) },
    });
    expect(rows).toHaveLength(1);
  });
});
