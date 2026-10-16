// POST /api/admin/mail-preview — TEMPORARY (manual QA only).
// Sends one template sample to an arbitrary address through the real
// transport. Administrator-only. DELETE THIS ROUTE after the QA pass —
// it must never ship permanently (arbitrary recipient = spam vector).
import { z } from "zod";
import { requireRole } from "../../../../lib/admin-auth";
import {
  sendExpiryReminderMail,
  sendPurchaseMail,
  sendTicketCreatedMail,
  sendTicketReplyMail,
} from "../../../../lib/mail";
import { logger } from "../../../../lib/logger";
import { AdminError, SessionError } from "../../../../lib/session";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  template: z.enum(["ticket-created", "ticket-reply", "expiry", "purchase"]),
  to: z.string().email().max(254),
});

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
  const { template, to } = parsed.data;
  try {
    if (template === "ticket-created") {
      await sendTicketCreatedMail(to, "tick00000001", "Не подключается VPN");
    } else if (template === "ticket-reply") {
      await sendTicketReplyMail(
        to,
        "tick00000001",
        "Не подключается VPN",
        "Здравствуйте! Попробуйте сменить сервер на Финляндию в приложении — это решает проблему в большинстве случаев.",
      );
    } else if (template === "expiry") {
      await sendExpiryReminderMail(
        to,
        "Мой ключ",
        new Date(Date.now() + 2 * 86_400_000).toISOString(),
        false,
      );
    } else {
      await sendPurchaseMail(to, {
        kind: "new",
        keyId: "key00000001",
        devices: 2,
        days: 30,
        amount: 299,
        currency: "RUB",
        subscriptionUrl: "https://sub.3set.online/s/test-sample-link",
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        orderId: "order00000001",
      });
    }
    logger.info({ route: "admin-mail-preview", outcome: "sent", template });
    return Response.json({ ok: true, template });
  } catch {
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
