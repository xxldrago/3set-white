// Telegraf module-singleton, bot-in-Next (D-01/D-04): the webhook route
// feeds updates via bot.handleUpdate; launch() runs ONLY in polling mode
// (dev, test token per D-02/D-03) so production never polls (Pitfall 6).
//
// PII/secrets discipline (T-03-05): logs carry update ids and outcomes
// only — never tokens, JWTs, or full updates. User-visible strings resolve
// through i18n keys (D-16), never hardcoded copy.
import { Telegraf } from "telegraf";
import { env } from "./env";
import { t } from "./i18n";
import { logger } from "./logger";
import { prisma } from "./prisma";

export const WEBHOOK_SECRET = env.WEBHOOK_SECRET;

// Polling (dev) selects the TEST token; every other mode uses prod.
const token = env.BOT_MODE === "polling" ? env.BOT_TEST_TOKEN : env.BOT_TOKEN;

export const bot = new Telegraf(token);

// /start skeleton (D-15): upsert telegram id + chat id into the shared
// users row (fan-out anchor for Phase 4), RU greeting + menu buttons.
bot.start(async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const telegramId = from.id;
  const chatId = ctx.chat?.id;
  await prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: {
      ...(chatId === undefined ? {} : { chatId: BigInt(chatId) }),
      firstName: from.first_name ?? undefined,
      lastName: from.last_name ?? undefined,
      username: from.username ?? undefined,
    },
    create: {
      telegramId: BigInt(telegramId),
      ...(chatId === undefined ? {} : { chatId: BigInt(chatId) }),
      firstName: from.first_name ?? undefined,
      lastName: from.last_name ?? undefined,
      username: from.username ?? undefined,
    },
  });
  logger.info({
    updateId: ctx.update.update_id,
    telegramId,
    outcome: "start-upserted",
  });
  await ctx.reply(t("bot.welcome"), {
    reply_markup: {
      keyboard: [
        [{ text: t("bot.menuKeys") }],
        [{ text: t("bot.menuGuides") }, { text: t("bot.menuHelp") }],
      ],
      resize_keyboard: true,
    },
  });
});

// Polling guard: dev only, test token (selected above), never during
// `next build` module collection, never in webhook (prod) mode.
if (env.BOT_MODE === "polling" && process.env["NEXT_PHASE"] !== "phase-production-build") {
  const g = globalThis as unknown as { __setwhiteBotLaunched?: boolean };
  if (!g.__setwhiteBotLaunched) {
    g.__setwhiteBotLaunched = true;
    void bot
      .launch()
      .then(() => logger.info({ outcome: "bot-polling-started" }))
      .catch((err: unknown) => logger.error({ outcome: "bot-polling-failed", err }));
  }
}
