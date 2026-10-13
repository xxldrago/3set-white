// Administrator Telegram pushes: new support tickets (+ balance alerts
// live in lib/balance-alert.ts). Best-effort by contract: fire-and-forget,
// silent in test env, failures resolve quietly. Targets resolve from the
// `admin_users` table (role=administrator) plus the env bootstrap list, so
// newly assigned admins are covered without a restart.
import { t } from "./i18n";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { parseAdminTelegramIds } from "./balance-alert";
import { env } from "./env";

async function adminChatIds(): Promise<string[]> {
  const rows = await prisma.adminUser
    .findMany({
      where: { role: "administrator" },
      select: { telegramId: true },
    })
    .catch(() => []);
  const ids = new Set<string>(rows.map((row) => String(row.telegramId)));
  for (const id of parseAdminTelegramIds(env.ADMIN_TELEGRAM_IDS)) {
    ids.add(String(id));
  }
  return [...ids];
}

async function pushAll(text: string): Promise<void> {
  if (process.env["NODE_ENV"] === "test") return;
  try {
    const chats = await adminChatIds();
    if (chats.length === 0) return;
    const { bot } = await import("./bot");
    await Promise.all(
      chats.map((chat) =>
        bot.telegram.sendMessage(chat, text.slice(0, 4000)).catch(() => undefined),
      ),
    );
  } catch (err) {
    logger.warn({ route: "admin-notify", outcome: "send_failed" });
    void err;
  }
}

/** A new support ticket just landed in the shared queue. */
export function notifyAdminsNewTicket(ticketId: string, subject: string): void {
  void (async () => {
    try {
      await pushAll(t("admin.newTicketDm", { id: ticketId, subject }));
      logger.info({ route: "admin-notify", outcome: "ticket_sent" });
    } catch {
      // Best-effort only.
    }
  })();
}
