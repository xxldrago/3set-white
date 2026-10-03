// Server-only attachment pipeline (D-53..D-56 / SUP-02).
//
// Image bytes from both channels (bot `getFileLink` download and cabinet
// multipart) converge here BEFORE any DB metadata is written. Format is decided
// from decoded bytes via `sharp` — never from a client filename or MIME — and
// every accepted image is re-encoded to a bounded WebP stored under the local
// upload volume. No public URL is ever produced (D-56); callers read bytes back
// through `readAttachment`, which confines the resolved path to UPLOAD_DIR.
//
// Server-only: import `sharp` only here / from other server modules; never from
// a client component. Never log bytes, paths, or message bodies (AG-8).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env";

/** 5 MiB raw-byte cap (D-54), enforced before decode. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Formats accepted from the decoded magic bytes only (T-04-05). */
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

/** Longest output edge; `fit: "inside"` keeps the aspect ratio. */
const MAX_DIMENSION = 1600;

/** Decompression-bomb guard — reject absurdly large pixel counts (T-04-07). */
const MAX_INPUT_PIXELS = 4096 * 4096;

/** Absolute, resolved storage root. Server-side only. */
const UPLOAD_DIR = path.resolve(env.UPLOAD_DIR);

/** Thrown when bytes are empty/oversized, not an allowed format, or undecodable. */
export class UnsupportedImageError extends Error {
  constructor(message = "unsupported_image") {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

/** The single attachment contract both channels produce (D-55). */
export interface NormalizedAttachment {
  data: Buffer;
  mime: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Validate raw bytes by decoded format, then downscale/re-encode to WebP.
 *
 * Rejects empty and >5 MiB inputs before decode, then decides the format from
 * `sharp.metadata().format` (magic bytes — a spoofed filename/MIME is ignored).
 * Only jpeg/png/webp pass; SVG/HTML/anything else is rejected.
 */
export async function normalizeImage(input: Buffer): Promise<NormalizedAttachment> {
  if (input.byteLength === 0 || input.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new UnsupportedImageError("size");
  }
  try {
    const pipeline = sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false, // first frame only — avoids animated-WebP bombs
    });
    const meta = await pipeline.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new UnsupportedImageError("format");
    }

    const { data, info } = await pipeline
      .rotate() // honor EXIF orientation
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    return {
      data,
      mime: "image/webp",
      width: info.width,
      height: info.height,
      sizeBytes: data.byteLength,
    };
  } catch (err) {
    if (err instanceof UnsupportedImageError) throw err;
    throw new UnsupportedImageError("decode");
  }
}

/**
 * Persist a normalized attachment under `UPLOAD_DIR/<ticketId>/<uuid>.webp`.
 *
 * The storage name is always server-generated; the caller-supplied `ticketId`
 * is used only as a directory segment (never a filename). Returns a path
 * RELATIVE to UPLOAD_DIR — only that relative path is stored in the DB.
 */
export async function saveAttachment(
  ticketId: string,
  n: NormalizedAttachment,
): Promise<string> {
  const name = `${randomUUID()}.webp`;
  const abs = path.join(UPLOAD_DIR, ticketId, name);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, n.data, { flag: "wx" });
  return path.relative(UPLOAD_DIR, abs);
}

/**
 * Read stored bytes back through the path-confinement guard.
 *
 * The resolved absolute path MUST stay under UPLOAD_DIR; anything that escapes
 * (a `..` segment or an absolute path) is refused (T-04-06).
 */
export async function readAttachment(relPath: string): Promise<Buffer> {
  const abs = path.resolve(UPLOAD_DIR, relPath);
  if (!abs.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error("attachments:path_escape");
  }
  return readFile(abs);
}
