// Phase 6 session-subject vectors (D-82): new `{ uid, tid? }` roundtrip
// plus legacy `{ tid }` back-compat — pure lib/auth.ts level, no DB.
// Throwaway secret only.
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../../lib/auth";

const SECRET = "userid-vector-throwaway-secret-32ch!";

describe("auth session userId subject", () => {
  it("uid+tid roundtrips both claims", async () => {
    const token = await signSession(7, 300000011, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      userId: 7,
      telegramId: 300000011,
    });
  });

  it("uid-only roundtrips with null telegramId", async () => {
    const token = await signSession(8, null, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      userId: 8,
      telegramId: null,
    });
  });

  it("legacy tid-only token stays readable (back-compat)", async () => {
    const token = await signSession(300000012, SECRET);
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      userId: null,
      telegramId: 300000012,
    });
  });

  it("non-finite claims are rejected", async () => {
    const token = await signSession(9, 300000013, SECRET);
    // Sanity: the genuine token verifies first.
    await expect(verifySession(token, SECRET)).resolves.not.toBeNull();
    await expect(verifySession("garbage.token.here", SECRET)).resolves.toBeNull();
    await expect(verifySession("", SECRET)).resolves.toBeNull();
  });
});
