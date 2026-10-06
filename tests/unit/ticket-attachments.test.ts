// SUP-02 attachment pipeline vectors: magic-byte acceptance, size/pixel caps,
// WebP downscale, and path confinement (T-04-05/06/07). Pure unit style
// (qr.test.ts) — real `sharp`, no DB, no network.
//
// UPLOAD_DIR is set to a fresh temp dir BEFORE the module is imported, because
// `lib/attachments.ts` resolves `env.UPLOAD_DIR` once at module load. Static
// imports are hoisted above that assignment, so the module is imported
// dynamically after the env is pointed at the temp dir.
import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

const UPLOAD_DIR = await mkdtemp(path.join(tmpdir(), "attachments-test-"));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const {
  MAX_ATTACHMENT_BYTES,
  UnsupportedImageError,
  normalizeImage,
  readAttachment,
  saveAttachment,
} = await import("../../lib/attachments");

afterAll(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

/** Build a real in-memory fixture in the requested format. */
async function fixture(
  format: "jpeg" | "png" | "webp",
  width: number,
  height: number,
): Promise<Buffer> {
  const img = sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } },
  });
  if (format === "jpeg") return img.jpeg().toBuffer();
  if (format === "png") return img.png().toBuffer();
  return img.webp().toBuffer();
}

describe("normalizeImage — magic-byte image validation (T-04-05)", () => {
  it("accepts jpeg/png/webp and returns normalized WebP bytes", async () => {
    for (const fmt of ["jpeg", "png", "webp"] as const) {
      const out = await normalizeImage(await fixture(fmt, 64, 48));
      expect(out.mime).toBe("image/webp");
      expect(out.width).toBe(64);
      expect(out.height).toBe(48);
      expect(out.sizeBytes).toBe(out.data.byteLength);
      // WebP container magic: RIFF....WEBP
      expect(out.data.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(out.data.subarray(8, 12).toString("ascii")).toBe("WEBP");
    }
  });

  it("rejects a non-image buffer with UnsupportedImageError", async () => {
    await expect(normalizeImage(Buffer.from("this is not an image"))).rejects.toBeInstanceOf(
      UnsupportedImageError,
    );
    // HTML/SVG bytes must never be accepted (Pitfall 2 / D-56).
    await expect(
      normalizeImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
  });

  it("downscales a 3000px image to <=1600 and never enlarges a small one", async () => {
    const wide = await normalizeImage(await fixture("png", 3000, 100));
    expect(wide.width).toBeLessThanOrEqual(1600);
    expect(wide.height).toBeLessThanOrEqual(1600);
    // aspect preserved (3000x100 → 1600x~53)
    expect(wide.height).toBeLessThan(wide.width);

    const small = await normalizeImage(await fixture("png", 32, 32));
    expect(small.width).toBe(32);
    expect(small.height).toBe(32);
  });

  it("rejects an empty buffer and a buffer over 5 MiB", async () => {
    await expect(normalizeImage(Buffer.alloc(0))).rejects.toBeInstanceOf(UnsupportedImageError);
    await expect(
      normalizeImage(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)),
    ).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});

describe("attachment path confinement (T-04-06)", () => {
  it("readAttachment refuses a traversal path", async () => {
    await expect(readAttachment("../escape")).rejects.toThrow("attachments:path_escape");
  });

  it("readAttachment refuses an absolute path", async () => {
    await expect(readAttachment("/etc/passwd")).rejects.toThrow("attachments:path_escape");
  });

  it("saveAttachment writes under UPLOAD_DIR and returns a relative path", async () => {
    const normalized = await normalizeImage(await fixture("png", 32, 32));
    const rel = await saveAttachment("tkt_test_001", normalized);

    expect(path.isAbsolute(rel)).toBe(false);
    expect(rel.startsWith("..")).toBe(false);
    expect(rel.endsWith(".webp")).toBe(true);

    const abs = path.resolve(UPLOAD_DIR, rel);
    expect(abs.startsWith(UPLOAD_DIR + path.sep)).toBe(true);
    expect((await stat(abs)).isFile()).toBe(true);
    expect(await readFile(abs)).toEqual(normalized.data);

    // Round-trip through the confinement guard returns the same bytes.
    expect(await readAttachment(rel)).toEqual(normalized.data);
  });
});
