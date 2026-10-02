// Telegraf module-singleton, bot-in-Next (D-01/D-04): the webhook route
// feeds updates via bot.handleUpdate; launch() runs ONLY in polling mode
// (dev, test token per D-02/D-03) so production never polls (Pitfall 6).
//
// PII/secrets discipline (T-03-05): logs carry update ids and outcomes
// only — never tokens, JWTs, or full updates. User-visible strings resolve
// through i18n keys (D-16), never hardcoded copy.
import { Telegraf } from "telegraf";
import { artemida } from "./artemida";
import { env } from "./env";
import { t, tp } from "./i18n";
import {
  formatKeyDate,
  getSubscriptionForUser,
  listKeys,
  revalidateKeys,
  startTrial,
  statusLabel,
} from "./keys-service";
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
        [{ text: t("bot.menuTrial") }, { text: t("bot.menuTariffs") }],
        [{ text: t("bot.menuKeys") }],
        [{ text: t("bot.menuGuides") }, { text: t("bot.menuHelp") }],
      ],
      resize_keyboard: true,
    },
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — trial + tariff entry (D-25 / TRIAL-01).
//
// The bot calls the SAME lib/keys-service.startTrial the cabinet BFF uses and
// the SAME lib/artemida.getPricing path /api/pricing uses — no duplicated
// Prisma or fetch logic. Raw provider text is never sent (D-19/D-24): failures
// reply with an i18n message only.
// ---------------------------------------------------------------------------
const MIN_DEVICES = 2; // provider minDevices=2 (contract lock 02-01)
const MAX_DEVICES = 10;
const priceFormatter = new Intl.NumberFormat("ru-RU");

function daysLabel(days: number): string {
  if (days === 7) return t("pricing.days7");
  if (days === 30) return t("pricing.days30");
  return t("pricing.days90");
}

function tariffDaysKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: t("pricing.days7"), callback_data: "tariff:days:7" },
        { text: t("pricing.days30"), callback_data: "tariff:days:30" },
        { text: t("pricing.days90"), callback_data: "tariff:days:90" },
      ],
    ],
  };
}

function tariffDevicesKeyboard(days: number) {
  const buttons: Array<{ text: string; callback_data: string }> = [];
  for (let d = MIN_DEVICES; d <= MAX_DEVICES; d += 1) {
    buttons.push({ text: String(d), callback_data: `tariff:devices:${days}:${d}` });
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3));
  return { inline_keyboard: rows };
}

// One-tap trial from the bot (identical server-enforced path as the cabinet).
bot.hears(t("bot.menuTrial"), async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  try {
    const result = await startTrial(BigInt(from.id));
    if (result.kind === "already_used") {
      await ctx.reply(`${t("trial.usedHeading")}\n${t("trial.usedBody")}`);
      logger.info({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "trial-already-used",
      });
      return;
    }
    // The sub-link message is finalized in plan 02-05; here send the key id
    // plus the fixed trial offer meta (1 day / 2 devices).
    await ctx.reply(`${t("bot.trialIssued")}\n${t("trial.subtitle")}\n${result.key.id}`);
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "trial-created" });
  } catch {
    await ctx.reply(t("trial.error"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "trial-failed" });
  }
});

// D-25 tariff keyboard: days → devices → live price from the shared path.
bot.hears(t("bot.menuTariffs"), async (ctx) => {
  await ctx.reply(t("pricing.title"), { reply_markup: tariffDaysKeyboard() });
});

bot.action(/^tariff:days:(\d+)$/, async (ctx) => {
  const days = Number(ctx.match?.[1]);
  await ctx.answerCbQuery();
  await ctx.reply(t("pricing.devicesLabel"), { reply_markup: tariffDevicesKeyboard(days) });
});

bot.action(/^tariff:devices:(\d+):(\d+)$/, async (ctx) => {
  const days = Number(ctx.match?.[1]);
  const devices = Number(ctx.match?.[2]);
  await ctx.answerCbQuery();
  try {
    const pricing = await artemida.getPricing({ days, devices });
    await ctx.reply(
      `${daysLabel(days)} · ${devices}\n${t("pricing.price", {
        price: priceFormatter.format(pricing.price),
      })}`,
    );
  } catch {
    await ctx.reply(t("pricing.error"));
  }
});

// «Мои ключи» — the SAME listKeys/revalidateKeys read path the cabinet uses
// (cache-first, D-29). Reply from the local mirror, then refresh from ARTEMIDA
// in the background; every string resolves through t() (D-16), never raw
// provider data. The key-detail / subscription-link message is added in 02-05.
bot.hears(t("bot.menuKeys"), async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const telegramId = BigInt(from.id);
  try {
    const cached = await listKeys(telegramId);
    // Background refresh: best-effort, never blocks or fails the reply.
    void revalidateKeys(telegramId).catch(() => {
      logger.warn({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "keys-revalidate-failed",
      });
    });

    if (cached.length === 0) {
      await ctx.reply(t("bot.keysEmpty"));
      return;
    }

    const shown = cached.slice(0, 10);
    const header =
      cached.length >= 2
        ? `${t("bot.keysTitle")} · ${tp("subs.count", cached.length)}`
        : t("bot.keysTitle");
    const lines = shown.map((key) => {
      const expiry = key.expiresAt ? formatKeyDate(key.expiresAt) : "—";
      const devices =
        key.devices !== null && key.deviceLimit !== null
          ? t("key.devicesCount", { n: key.devices, max: key.deviceLimit })
          : "—";
      return `${key.name ?? key.id}\n${statusLabel(key.statusKind, key.expiresAt)} · ${t("key.expires", {
        date: expiry,
      })}\n${devices}`;
    });
    // One inline control per key opens its subscription link (02-05 / CAB-04).
    // Index-based callback_data keeps the payload short (Telegram 64-byte cap).
    const keyboard = shown.map((key, index) => [
      { text: `${key.name ?? key.id} · ${t("key.linkTitle")}`, callback_data: `key:link:${index}` },
    ]);
    // Cap the message well under Telegram's 4096-char limit.
    await ctx.reply([header, ...lines].join("\n\n").slice(0, 4000), {
      reply_markup: { inline_keyboard: keyboard },
    });
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "keys-listed" });
  } catch {
    await ctx.reply(t("bot.keysError"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "keys-failed" });
  }
});

// 02-05 (CAB-04): resolve a key's subscription link through the SAME
// getSubscriptionForUser service the cabinet uses, then reply with the URL plus
// a «Как подключиться» pointer. The subscription URL is credential-bearing
// (T-02-18): it is sent to the owning chat only and never written to a log.
bot.action(/^key:link:(\d+)$/, async (ctx) => {
  const from = ctx.from;
  await ctx.answerCbQuery();
  if (!from) return;
  const telegramId = BigInt(from.id);
  try {
    const keys = await listKeys(telegramId);
    const key = keys[Number(ctx.match?.[1])];
    if (!key) {
      await ctx.reply(t("key.linkUnavailable"));
      return;
    }
    const subscription = await getSubscriptionForUser(telegramId, key.id);
    if (!subscription?.subscriptionUrl) {
      await ctx.reply(t("key.linkUnavailable"));
      logger.info({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "key-link-unavailable",
      });
      return;
    }
    await ctx.reply(
      `${t("key.linkTitle")}\n${subscription.subscriptionUrl}\n\n${t("key.guidesCta")} — ${t("bot.menuGuides")}`,
    );
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "key-link-sent" });
  } catch {
    await ctx.reply(t("key.linkError"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "key-link-failed" });
  }
});

// TRIAL-03 bot half: the «Инструкции» button resolves the SAME guide sections
// as app/guides/page.tsx — one copy, referenced by key, never duplicated.
bot.hears(t("bot.menuGuides"), async (ctx) => {
  await ctx.reply(
    [
      t("guides.title"),
      "",
      t("guides.v2rayTitle"),
      t("guides.v2rayText"),
      "",
      t("guides.streisandTitle"),
      t("guides.streisandText"),
      "",
      t("guides.hiddifyTitle"),
      t("guides.hiddifyText"),
    ].join("\n"),
  );
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
