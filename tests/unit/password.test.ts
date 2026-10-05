// Phase 6 password vectors (D-83/D-85, T-06-01): argon2id roundtrip,
// wrong-password reject, garbage-hash → false (never throws), min-8
// enforcement. Throwaway inputs only — never real passwords.
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../lib/password";

describe("password", () => {
  it("hash-verify roundtrip succeeds", async () => {
    const hash = await hashPassword("throwaway-pass-123");
    expect(hash).not.toContain("throwaway-pass-123");
    await expect(verifyPassword(hash, "throwaway-pass-123")).resolves.toBe(true);
  });

  it("wrong password is rejected", async () => {
    const hash = await hashPassword("throwaway-pass-123");
    await expect(verifyPassword(hash, "different-pass-456")).resolves.toBe(false);
  });

  it("garbage hash returns false, never throws", async () => {
    await expect(verifyPassword("not-a-hash", "whatever-123")).resolves.toBe(false);
    await expect(verifyPassword("", "whatever-123")).resolves.toBe(false);
    await expect(verifyPassword(null, "whatever-123")).resolves.toBe(false);
    await expect(verifyPassword(undefined, "whatever-123")).resolves.toBe(false);
  });

  it("garbage plaintext returns false, never throws", async () => {
    const hash = await hashPassword("throwaway-pass-123");
    await expect(verifyPassword(hash, "")).resolves.toBe(false);
    await expect(verifyPassword(hash, null)).resolves.toBe(false);
  });

  it("min-8 is enforced server-side", async () => {
    await expect(hashPassword("short7!")).rejects.toThrow("password_too_short");
    await expect(hashPassword("")).rejects.toThrow("password_too_short");
    // Exactly 8 passes the gate.
    const hash = await hashPassword("exact-88");
    await expect(verifyPassword(hash, "exact-88")).resolves.toBe(true);
  });

  it("hashes are salted (same password, different digests)", async () => {
    const a = await hashPassword("same-throwaway-1");
    const b = await hashPassword("same-throwaway-1");
    expect(a).not.toBe(b);
    await expect(verifyPassword(a, "same-throwaway-1")).resolves.toBe(true);
    await expect(verifyPassword(b, "same-throwaway-1")).resolves.toBe(true);
  });
});
