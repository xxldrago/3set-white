// CAB-02 session vectors (T-03-04): jose HS256 roundtrip plus algorithm/
// secret confusion cases under a throwaway secret — never the real one.
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../../lib/auth";

const SECRET = "unit-vector-throwaway-secret-32ch!!";
const WRONG_SECRET = "wrong-throwaway-secret-32-chars!!!!";

function base64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

describe("session", () => {
  it("sign-verify roundtrip succeeds", async () => {
    const token = await signSession(300000004, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toBe(300000004);
  });

  it("wrong secret is rejected", async () => {
    const token = await signSession(300000004, SECRET);
    await expect(verifySession(token, WRONG_SECRET)).resolves.toBeNull();
  });

  it("alg:none is rejected", async () => {
    const unsigned = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ tid: 300000004 })}.`;
    await expect(verifySession(unsigned, SECRET)).resolves.toBeNull();
  });

  it("tampered payload is rejected", async () => {
    const token = await signSession(300000004, SECRET);
    const [h, , s] = token.split(".");
    const forgedPayload = base64url({ tid: 999999999 });
    await expect(verifySession(`${h}.${forgedPayload}.${s}`, SECRET)).resolves.toBeNull();
  });
});
