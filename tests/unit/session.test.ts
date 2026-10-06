// CAB-02 session vectors (T-03-04) + Phase 6 userId subject (D-82):
// jose HS256 roundtrip plus algorithm/secret confusion cases under a
// throwaway secret — never the real one. New `{ uid, tid? }` tokens carry
// the users.id row; legacy 2-arg mints stay `{ tid }`-only and verify with
// userId null (resolved server-side via the telegram row).
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../../lib/auth";

const SECRET = "unit-vector-throwaway-secret-32ch!!";
const WRONG_SECRET = "wrong-throwaway-secret-32-chars!!!!";

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

describe("session", () => {
  it("new sign-verify roundtrip carries uid + tid", async () => {
    const token = await signSession(42, 300000004, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      userId: 42,
      telegramId: 300000004,
    });
  });

  it("email-only session carries uid with null tid", async () => {
    const token = await signSession(42, null, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      userId: 42,
      telegramId: null,
    });
  });

  it("legacy tid-only token verifies with null userId", async () => {
    const token = await signSession(300000004, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      userId: null,
      telegramId: 300000004,
    });
  });

  it("wrong secret is rejected", async () => {
    const token = await signSession(42, 300000004, SECRET);
    await expect(verifySession(token, WRONG_SECRET)).resolves.toBeNull();
  });

  it("alg:none is rejected", async () => {
    const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ tid: 300000004 })}.`;
    await expect(verifySession(unsigned, SECRET)).resolves.toBeNull();
  });

  it("tampered payload is rejected", async () => {
    const token = await signSession(42, 300000004, SECRET);
    const [h, , s] = token.split(".");
    const forgedPayload = base64url({ uid: 42, tid: 999999999 });
    await expect(verifySession(`${h}.${forgedPayload}.${s}`, SECRET)).resolves.toBeNull();
  });

  it("token without identity claims is rejected", async () => {
    const token = await signSession(42, 300000004, SECRET);
    const [h, , s] = token.split(".");
    const emptyPayload = base64url({ foo: "bar" });
    await expect(verifySession(`${h}.${emptyPayload}.${s}`, SECRET)).resolves.toBeNull();
  });
});
