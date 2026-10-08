// POST /api/wallet/withdraw — request a payout (session-gated).
//
// Body: `{ amount, contact? }`. The service enforces the admin minimum and
// the balance, then reserves via `withdrawal_hold` in one transaction.
// Errors: 400 bad_request / amount_too_small / insufficient_funds,
// 401 unauthorized.
import { z } from "zod";
import { getReferralSettings, requestWithdrawal } from "../../../../lib/referrals";
import { logger } from "../../../../lib/logger";
import { SessionError, requireSession } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  amount: z.number().int().min(1).max(100_000_000),
  contact: z.string().trim().min(1).max(256).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let userId: number;
  try {
    ({ userId } = await requireSession());
  } catch (err) {
    if (err instanceof SessionError) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error({ route: "wallet-withdraw", outcome: "session_error" });
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
  try {
    const settings = await getReferralSettings();
    if (parsed.data.amount < settings.minWithdraw) {
      return Response.json(
        { error: "amount_too_small", minWithdraw: settings.minWithdraw },
        { status: 400 },
      );
    }
    const row = await requestWithdrawal(userId, parsed.data.amount, parsed.data.contact ?? null);
    return Response.json({ withdrawal: { id: row.id, amount: row.amount, status: row.status } });
  } catch (err) {
    if (err instanceof Error && err.message === "withdrawal:too_small") {
      const settings = await getReferralSettings();
      return Response.json(
        { error: "amount_too_small", minWithdraw: settings.minWithdraw },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.message === "withdrawal:insufficient") {
      return Response.json({ error: "insufficient_funds" }, { status: 400 });
    }
    logger.error({ route: "wallet-withdraw", outcome: "request_error" });
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
