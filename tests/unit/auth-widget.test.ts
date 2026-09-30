// CAB-02 Widget verifier vectors (T-03-01): known-answer HMAC cases under
// a synthetic throwaway token only — no real token ever appears here.
import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWidget } from "../../lib/auth";
import { prisma } from "../../lib/prisma";
import { consumeWidgetHash } from "../../lib/replay";

const TOKEN = "900001:UNIT-VECTOR-THROWAWAY-NOT-A-REAL-TOKEN";

function signWidget(fields: Record<string, string | number>): string {
  const dataCheckString = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("\n");
  const secret = createHash("sha256").update(TOKEN).digest();
  return createHmac("sha256", secret).update(dataCheckString).digest("hex");
}

function genuineFields(authDate = Math.floor(Date.now() / 1000)) {
  return {
    id: 300000001,
    first_name: "Vector",
    last_name: "Test",
    username: "vector_test",
    auth_date: authDate,
  };
}

describe("auth-widget", () => {
  it("accepts a good Widget hash", () => {
    const fields = genuineFields();
    expect(verifyWidget({ ...fields, hash: signWidget(fields) }, TOKEN)).toBe(true);
  });

  it("rejects a forged Widget hash", () => {
    const fields = genuineFields();
    const good = signWidget(fields);
    const forged = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0");
    expect(verifyWidget({ ...fields, hash: forged }, TOKEN)).toBe(false);
  });

  it("rejects a stale auth_date", () => {
    const fields = genuineFields(Math.floor(Date.now() / 1000) - 90_000);
    expect(verifyWidget({ ...fields, hash: signWidget(fields) }, TOKEN)).toBe(false);
  });

  it("rejects a replayed hash", async () => {
    const fields = { ...genuineFields(), id: 300000002 };
    const hash = signWidget(fields);
    expect(verifyWidget({ ...fields, hash }, TOKEN)).toBe(true);
    expect(await consumeWidgetHash(hash)).toBe(true);
    expect(await consumeWidgetHash(hash)).toBe(false);
    await prisma.replayCache.deleteMany();
  });
});
