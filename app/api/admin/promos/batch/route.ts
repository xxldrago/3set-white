// POST /api/admin/promos/batch — generate N distinct codes in one call
// (administrator-only).
//
// The template's "пакетная генерация" is a real capability here: the same
// `createPromo` the single-code form uses, called once per code with a shared
// discount/type/limit/expiry and a random suffix so the codes differ. Nothing
// is simulated — each returned code exists in `promo_codes` and is immediately
// redeemable.
//
// Collision handling: `promo_codes.code` is UNIQUE, so a duplicate insert throws
// P2002. Each slot retries with a fresh suffix up to MAX_TRIES times; a slot
// that never wins is reported in `failed` instead of failing the whole batch.
//
// requireRole → 401/404; invalid body → 400.
import { randomInt } from "node:crypto";
import { z } from "zod";
import { requireRole } from "../../../../../lib/admin-auth";
import { logger } from "../../../../../lib/logger";
import {
  PROMO_CODE_RE,
  PROMO_MAX_DISCOUNT_PCT,
  PROMO_MAX_DISCOUNT_RUB,
  createPromo,
} from "../../../../../lib/promo";
import { AdminError, SessionError } from "../../../../../lib/session";

export const dynamic = "force-dynamic";

/** One request cannot create an unbounded number of rows. */
const MAX_BATCH = 50;
const MAX_TRIES = 6;
/** Crockford-ish alphabet: no I/O/0/1, so a code read aloud stays unambiguous. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SUFFIX_LEN = 6;

const bodySchema = z.object({
  count: z.number().int().min(1).max(MAX_BATCH),
  prefix: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .regex(/^[A-Z0-9-]*$/)
    .optional(),
  discount: z.number().int().min(1).max(PROMO_MAX_DISCOUNT_RUB),
  type: z.enum(["percentage", "fixed"]),
  maxUses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

function suffix(): string {
  let out = "";
  for (let i = 0; i < SUFFIX_LEN; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

export async function POST(req: Request): Promise<Response> {
  try {
    await requireRole("administrator");
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err instanceof AdminError) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    logger.error({ route: "admin-promos-batch", outcome: "session_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { count, discount, type, maxUses, expiresAt } = parsed.data;
  if (type === "percentage" && discount > PROMO_MAX_DISCOUNT_PCT) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  // A trailing dash keeps "SUMMER" → "SUMMER-XXXXXX" readable; an empty prefix
  // yields bare suffixes.
  const prefix = (parsed.data.prefix ?? "").replace(/-+$/, "");

  const created: { id: string; code: string }[] = [];
  const failed: string[] = [];

  for (let i = 0; i < count; i += 1) {
    let made = false;
    for (let attempt = 0; attempt < MAX_TRIES && !made; attempt += 1) {
      const code = prefix.length > 0 ? `${prefix}-${suffix()}` : suffix();
      // `promoInputSchema` bounds the code at 32 chars; skip impossible ones.
      if (!PROMO_CODE_RE.test(code)) break;
      try {
        const row = await createPromo({
          code,
          discount,
          type,
          maxUses: maxUses ?? null,
          expiresAt: expiresAt ?? null,
        });
        created.push({ id: row.id, code: row.code });
        made = true;
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        // A real failure (bad owner, DB down) aborts the slot.
        logger.error({ route: "admin-promos-batch", outcome: "create_error" });
        break;
      }
    }
    if (!made) failed.push(`#${i + 1}`);
  }

  if (created.length === 0) {
    return Response.json({ error: "create_failed", created: [], failed }, { status: 500 });
  }
  return Response.json({ created, failed, requested: count }, { status: 201 });
}
