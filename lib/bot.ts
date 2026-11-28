// Telegraf module-singleton, bot-in-Next (D-01/D-04): the webhook route
// feeds updates via bot.handleUpdate; launch() runs ONLY in polling mode
// (dev, test token per D-02/D-03) so production never polls (Pitfall 6).
//
// PII/secrets discipline (T-03-05): logs carry update ids and outcomes
// only — never tokens, JWTs, or full updates. User-visible strings resolve
// through i18n keys (D-16), never hardcoded copy.
import { randomUUID } from "node:crypto";
import { Telegraf, type Context } from "telegraf";
import { normalizeImage, saveAttachment } from "./attachments";
import { resolveTariffQuote } from "./pricing";
import { env } from "./env";
import { t, tp } from "./i18n";
import { TARIFF_DAYS, tariffDaysLabel } from "./tariff-grid";
import { guidePlatformMessage, isGuidePlatform } from "./bot-guides";
import {
  formatKeyDate,
  getSubscriptionForUser,
  hasPaidSubscriptionByUserId,
  listKeys,
  revalidateKeys,
  startTrial,
  statusLabel,
} from "./keys-service";
import {
  createOrder,
  keyDeviceLimit,
  precheckOwnedKey,
} from "./orders-service";
import { buildPayButton } from "./bot-payments";
import { logger } from "./logger";
import { prisma } from "./prisma";
import { buildSupportTicketContent, isSupportIntakeArmed } from "./support-intake";
import {
  beginSupportPrompt,
  clearSupportPrompt,
  createTicket,
  type AttachmentDescriptor,
} from "./tickets-service";
import { bindLoginToken, parseLoginStartPayload } from "./telegram-login";
import { bindLinkToken, parseLinkStartPayload } from "./telegram-link";
import { bindMobileNonce, parseNonceStartPayload } from "./telegram-mobile-nonce";
import {
  REFERRAL_CODE_RE,
  ensureReferralCode,
  getReferralSummary,
  pinReferrer,
} from "./referrals";
import { validatePromo } from "./promo";

export const WEBHOOK_SECRET = env.WEBHOOK_SECRET;

// Polling OUTSIDE production selects the TEST token so a local run never
// steals the production bot's updates. In production there is exactly one bot,
// so polling must use the real token: Telegram cannot deliver webhooks to this
// host's IP (inbound SYN from 149.154.0.0/16 / 91.108.4.0/22 never arrives), so
// polling is the only delivery path. See docs/DEPLOY.md § Telegram.
const token =
  env.BOT_MODE === "polling" && process.env.NODE_ENV !== "production"
    ? env.BOT_TEST_TOKEN
    : env.BOT_TOKEN;

export const bot = new Telegraf(token, {
  telegram: { apiRoot: env.TELEGRAM_API_ROOT },
});

type PanelExtra = Parameters<Context["reply"]>[1];

/**
 * Keep an interaction inside ONE message: a button tap edits the message that
 * owns the button instead of stacking a new one. Commands (nothing to edit)
 * and non-editable messages fall back to a normal reply.
 */
async function showPanel(ctx: Context, text: string, extra?: PanelExtra): Promise<void> {
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, extra as never);
      return;
    } catch (err) {
      const description = String((err as { description?: unknown } | null)?.description ?? "");
      // Re-tapping the same button is not an error worth a duplicate message.
      if (description.includes("message is not modified")) return;
    }
  }
  await ctx.reply(text, extra);
}

type InlineButton = { text: string; url: string } | { text: string; callback_data: string };

const MAIN_MENU_CALLBACK = "menu:home";

/**
 * Telegram rejects inline button URLs outside http(s)/tg: a `v2rayng://`
 * import button fails the WHOLE message (`BUTTON_URL_INVALID`), which is why
 * the key-link panel answered «Не удалось загрузить ссылку» and the guides
 * never appeared. Every button that opens an app therefore uses https, and the
 * subscription link travels as message text.
 */
function installPageUrl(): string {
  return `${env.APP_BASE_URL}/install`;
}

/**
 * A panel must never be a dead end: every keyboard ends with a «В меню» row
 * that edits the same message back to the main menu.
 */
function withMenu(rows: InlineButton[][]): InlineButton[][] {
  return [...rows, [{ text: t("bot.backToMenu"), callback_data: MAIN_MENU_CALLBACK }]];
}

/** The main menu keyboard — shared by /start and every «В меню» tap. */
function mainMenuKeyboard(): { inline_keyboard: InlineButton[][] } {
  return {
    inline_keyboard: [
      [
        { text: t("bot.menuTrial"), callback_data: "menu:trial" },
        { text: t("bot.menuTariffs"), callback_data: "menu:tariffs" },
      ],
      [{ text: t("bot.menuKeys"), callback_data: "menu:keys" }],
      [{ text: t("bot.menuReferrals"), callback_data: "menu:referrals" }],
      [
        { text: t("bot.menuGuides"), callback_data: "menu:guides" },
        { text: t("bot.menuHelp"), callback_data: "menu:help" },
      ],
      [{ text: t("bot.menuSupport"), callback_data: "menu:support" }],
      [{ text: t("bot.menuShare"), callback_data: "menu:share" }],
      [
        { text: t("bot.menuPrivacy"), callback_data: "menu:privacy" },
        { text: t("bot.menuTerms"), callback_data: "menu:terms" },
      ],
    ],
  };
}

/**
 * Subscription URL of the user's first NON-expired key: fresh from the
 * provider, with the cached value as a fallback so a provider blip never hides
 * a subscription the user already paid for. Expired keys are skipped entirely.
 */
async function activeSubscriptionUrl(telegramId: bigint): Promise<string | null> {
  const keys = await listKeys(telegramId);
  const key = keys.find((row) => row.statusKind !== "expired");
  if (!key) return null;
  try {
    const subscription = await getSubscriptionForUser(telegramId, key.id);
    if (subscription?.subscriptionUrl) return subscription.subscriptionUrl;
  } catch {
    // fall through to the cached mirror
  }
  return key.subscriptionUrl ?? null;
}

// An admin block (users.blocked_at) also closes the bot: every update for a
// blocked account gets one explanation instead of a working menu. The cabinet
// session gates reject the same flag, so both surfaces agree.
bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from || from.is_bot) return next();
  const row = await prisma.user
    .findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { blockedAt: true },
    })
    .catch(() => null);
  if (row?.blockedAt) {
    await ctx.reply(t("bot.blocked")).catch(() => null);
    return;
  }
  return next();
});

// /start skeleton (D-15): upsert telegram id + chat id into the shared
// users row (fan-out anchor for Phase 4), RU greeting + menu buttons.
bot.start(async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const telegramId = from.id;
  const chatId = ctx.chat?.id;
  const row = await prisma.user.upsert({
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
    select: { id: true },
  });
  // Referral start (`/start 3SET-XXXXXX` from a shared link): pins the
  // inviter once — unknown codes, self-codes and re-pins are silent no-ops.
  // Runs before the login branch so both can share one /start.
  const refPayload = (ctx.startPayload ?? "").trim().toUpperCase();
  if (REFERRAL_CODE_RE.test(refPayload)) {
    const pinned = await pinReferrer(row.id, refPayload).catch(() => null);
    if (pinned !== null) {
      await ctx.reply(t("bot.refPinned"));
      logger.info({ updateId: ctx.update.update_id, telegramId, outcome: "ref-pinned" });
    }
  }
  logger.info({
    updateId: ctx.update.update_id,
    telegramId,
    outcome: "start-upserted",
  });
  // Bot-redirect login (G-06-4b, plan 06-06; code binding plan 06-09): when the
  // start payload carries `login_<token>`, bind the cabinet-issued token to
  // this Telegram id and DM the confirmation code. The upsert above already
  // stamped the profile; bind is idempotent for the same id and rejects a
  // different one. The code is delivered ONLY to this chat (CR-01) — the
  // issuing browser must submit it to `consume`. Non-login starts skip this
  // branch entirely and behave byte-identically (no extra reply).
  // Cabinet Telegram-linking (link-via-bot): a `link_<token>` payload binds
  // the token to this Telegram id AND links the accounts immediately — no
  // code round-trip (the requesting browser is already authenticated).
  // Runs before the login branch; a link payload is never a login payload.
  const linkToken = parseLinkStartPayload(ctx.startPayload);
  if (linkToken) {
    const bound = await bindLinkToken(linkToken, telegramId);
    if (bound.kind === "bound") {
      await ctx.reply(t("bot.linkDone"));
    } else if (bound.kind === "conflict") {
      await ctx.reply(t("bot.linkConflict"));
    } else {
      await ctx.reply(t("bot.loginInvalid"));
    }
    logger.info({
      updateId: ctx.update.update_id,
      telegramId,
      outcome: bound.kind === "bound" ? "link-bound" : "link-invalid",
    });
  }
  const loginToken = parseLoginStartPayload(ctx.startPayload);
  if (loginToken) {
    const bound = await bindLoginToken(loginToken, telegramId, {
      firstName: from.first_name ?? null,
      lastName: from.last_name ?? null,
      username: from.username ?? null,
      chatId: chatId === undefined ? null : BigInt(chatId),
    });
    await ctx.reply(
      bound.kind === "bound" ? t("bot.loginCode", { code: bound.code }) : t("bot.loginInvalid"),
    );
    logger.info({
      updateId: ctx.update.update_id,
      telegramId,
      outcome: bound.kind === "bound" ? "login-bound" : "login-invalid",
    });
  }
  // Mobile deep-link login (Phase 18): a `nonce_<32 hex>` payload binds the
  // app-issued nonce to this Telegram id. The app is already polling
  // `GET /api/mobile/auth/telegram/poll`, which flips 202 → 200 with a token
  // pair on the next tick — no code round-trip, because the nonce row is
  // created with `user_id = null` and can only ever authenticate the Telegram
  // account that presses Start (see lib/telegram-mobile-nonce.ts).
  const mobileNonce = parseNonceStartPayload(ctx.startPayload);
  if (mobileNonce) {
    const bound = await bindMobileNonce(mobileNonce, telegramId);
    await ctx.reply(
      bound.kind === "bound" ? t("bot.mobileLoginDone") : t("bot.loginInvalid"),
    );
    logger.info({
      updateId: ctx.update.update_id,
      telegramId,
      outcome: bound.kind === "bound" ? "mobile-login-bound" : "mobile-login-invalid",
    });
  }
  // Payment return from Platega (bot channel): `payment_success_<orderId>` or `payment_failed_<orderId>`
  const paymentSuccessMatch = ctx.startPayload?.match(/^payment_success_(.+)$/);
  if (paymentSuccessMatch) {
    const orderId = paymentSuccessMatch[1];
    await ctx.reply(t("bot.payProvisioned"));
    logger.info({ updateId: ctx.update.update_id, telegramId, outcome: "payment-return-success", orderId });
    // The actual key with subscription link will be pushed via notify-provisioned outbox
  }
  const paymentFailedMatch = ctx.startPayload?.match(/^payment_failed_(.+)$/);
  if (paymentFailedMatch) {
    const orderId = paymentFailedMatch[1];
    await ctx.reply(t("bot.payFailed"));
    logger.info({ updateId: ctx.update.update_id, telegramId, outcome: "payment-return-failed", orderId });
  }
  await ctx.reply(t("bot.welcome"), { reply_markup: mainMenuKeyboard() });
});

// Every panel's «В меню» button: edit the same message back to the main menu.
bot.action(MAIN_MENU_CALLBACK, async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(ctx, t("bot.welcome"), { reply_markup: mainMenuKeyboard() });
});

// ---------------------------------------------------------------------------
// Referrals + promo codes in the bot.
// ---------------------------------------------------------------------------

/** «🎁 Рефералы» — code, link, stats (same summary the cabinet shows). */
bot.action("menu:referrals", async (ctx) => {
  await ctx.answerCbQuery();
  const from = ctx.from;
  if (!from) return;
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply(t("bot.keysError"));
      return;
    }
    const summary = await getReferralSummary(user.id);
    const link = `${env.APP_BASE_URL}/signup?ref=${summary.code}`;
    const settings = await import("./referrals").then((m) => m.getReferralSettings());
    // Money-mode earners (partners and percent/fixed inviters) get their rate
    // instead of the days line, so nobody sees "0 бонусных дней".
    if (summary.myRate.kind === "days") {
      await showPanel(
        ctx,
        t("bot.refStats", {
          code: summary.code,
          link,
          invited: summary.referrals,
          earned: summary.earned,
          balance: summary.balance,
          days: summary.bonusDays,
          inviterDays: settings.userMode === "days" ? settings.userDays : summary.myRate.value,
          inviterDaysLabel: settings.userMode === "days" ? "дней" : "дней",
          inviteeDays: settings.inviteeDays,
          inviteeDaysLabel: "дней",
        }),
        { reply_markup: { inline_keyboard: withMenu([]) } },
      );
    } else {
      const rate =
        summary.myRate.kind === "percent"
          ? `${summary.myRate.value}% с оборота`
          : `${summary.myRate.value} ₽ за заказ`;
      await showPanel(
        ctx,
        t("bot.refStatsMoney", {
          code: summary.code,
          link,
          invited: summary.referrals,
          earned: summary.earned,
          balance: summary.balance,
          rate,
        }),
        { reply_markup: { inline_keyboard: withMenu([]) } },
      );
    }
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "ref-stats" });
  } catch {
    await ctx.reply(t("bot.keysError"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "ref-stats-failed" });
  }
});

/**
 * `/promo CODE` — validate a discount code and stash it for the next order.
 * Read-only check here (no consumption); the shared order pipeline consumes
 * atomically at checkout. Unknown/expired/exhausted codes share one reply.
 */
bot.command("promo", async (ctx) => {
  const from = ctx.from;
  if (!from) return;
  const code = (ctx.message?.text ?? "").replace(/^\/promo(@\w+)?\s*/i, "").trim();
  if (!code) {
    await ctx.reply(t("bot.promoHint"));
    return;
  }
  try {
    const preview = await validatePromo(code, 100);
    if (!preview.ok) {
      await ctx.reply(t("bot.promoBad"));
      return;
    }
    await prisma.user.upsert({
      where: { telegramId: BigInt(from.id) },
      update: { pendingPromo: preview.row.code },
      create: { telegramId: BigInt(from.id), pendingPromo: preview.row.code },
      select: { id: true },
    });
    await ctx.reply(t("bot.promoSaved", { code: preview.row.code }));
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "promo-stashed" });
  } catch {
    await ctx.reply(t("bot.promoBad"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "promo-failed" });
  }
});

// ---------------------------------------------------------------------------
// Phase 2 — trial + tariff entry (D-25 / TRIAL-01).
//
// The bot calls the SAME lib/keys-service.startTrial the cabinet BFF uses and
// the SAME shared resolveTariffQuote /api/pricing uses — no duplicated
// Prisma or fetch logic. Raw provider text is never sent (D-19/D-24): failures
// reply with an i18n message only.
// ---------------------------------------------------------------------------
const priceFormatter = new Intl.NumberFormat("ru-RU");

function daysLabel(days: number): string {
  return tariffDaysLabel(days);
}

function tariffDaysKeyboard() {
  // Five periods do not fit one Telegram row comfortably; 3 + 2 reads better
  // and keeps every button a comfortable tap target.
  const all = TARIFF_DAYS.map((days) => ({
    text: daysLabel(days),
    callback_data: `tariff:days:${days}`,
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < all.length; i += 3) rows.push(all.slice(i, i + 3));
  rows.push([{ text: t("bot.backToMenu"), callback_data: MAIN_MENU_CALLBACK }]);
  return { inline_keyboard: rows };
}

/**
 * Device counts offered as inline presets. The storefront sells 2–10 devices
 * (see the help copy), so the whole range fits one inline keyboard — there is
 * no typed "other count" prompt, every control in the bot is an inline button.
 */
const DEVICE_PRESETS = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function tariffDevicesKeyboard(days: number) {
  const presets = DEVICE_PRESETS.map((d) => ({
    text: String(d),
    callback_data: `tariff:devices:${days}:${d}`,
  }));
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < presets.length; i += 3) rows.push(presets.slice(i, i + 3));
  rows.push([{ text: t("common.cancel"), callback_data: "menu:tariffs" }]);
  rows.push([{ text: t("bot.backToMenu"), callback_data: MAIN_MENU_CALLBACK }]);
  return { inline_keyboard: rows };
}

// One-tap trial from the bot (identical server-enforced path as the cabinet).
bot.action("menu:trial", async (ctx) => {
  await ctx.answerCbQuery();
  const from = ctx.from;
  if (!from) return;
  try {
    // Paying customers get no trial CTA outcome: a distinct reply instead
    // of the generic already-used copy.
    const owner = await prisma.user.findUnique({
      where: { telegramId: BigInt(from.id) },
      select: { id: true },
    });
    if (owner && (await hasPaidSubscriptionByUserId(owner.id))) {
      await ctx.reply(t("bot.trialHasSub"));
      logger.info({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "trial-has-subscription",
      });
      return;
    }
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
    await ctx.reply(`${t("bot.trialIssued")}\n${t("trial.subtitle")}\n${result.key.id}`, {
      reply_markup: {
        inline_keyboard: withMenu([[{ text: t("bot.menuKeys"), callback_data: "menu:keys" }]]),
      },
    });
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "trial-created" });
  } catch {
    await ctx.reply(t("trial.error"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "trial-failed" });
  }
});

// D-25 tariff keyboard: days → devices → live price from the shared path.
bot.action("menu:tariffs", async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(ctx, t("pricing.title"), { reply_markup: tariffDaysKeyboard() });
});

// The trial expiry reminder's buy CTA lands here (D-63): reply the days keyboard
// so a trial user starts the NORMAL Phase 3 purchase flow — no money logic is
// duplicated. The callback carries no key id (the reminder is per-key but the
// purchase is a fresh `new` order through the tariff picker).
bot.action("tariff:start", async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(ctx, t("pricing.title"), { reply_markup: tariffDaysKeyboard() });
});

bot.action(/^tariff:days:(\d+)$/, async (ctx) => {
  const days = Number(ctx.match?.[1]);
  await ctx.answerCbQuery();
  await showPanel(ctx, t("pricing.devicesLabel"), { reply_markup: tariffDevicesKeyboard(days) });
});

/** Quote a (days, devices) pair and offer the second-tap purchase button. */
async function replyTariffQuote(ctx: Context, days: number, devices: number): Promise<void> {
  try {
    const pricing = await resolveTariffQuote(days, devices);
    await showPanel(
      ctx,
      `${daysLabel(days)} · ${devices}\n${t("pricing.price", {
        price: priceFormatter.format(pricing.amount),
      })}`,
      // The purchase itself is a second tap (D-33): the price is quoted first,
      // then the user buys — the server re-quotes on creation.
      {
        reply_markup: {
          inline_keyboard: withMenu([
            [{ text: t("pay.cta"), callback_data: `tariff:buy:${days}:${devices}` }],
          ]),
        },
      },
    );
  } catch {
    await ctx.reply(t("pricing.error"));
  }
}

bot.action(/^tariff:devices:(\d+):(\d+)$/, async (ctx) => {
  const days = Number(ctx.match?.[1]);
  const devices = Number(ctx.match?.[2]);
  await ctx.answerCbQuery();
  await replyTariffQuote(ctx, days, devices);
});

// ---------------------------------------------------------------------------
// Phase 3 — bot payment parity (D-47, PAY-01/PAY-04, UI-SPEC §6/§7).
//
// The bot calls the SAME `orders-service.createOrder` the cabinet BFF uses —
// no duplicated Prisma or fetch logic. After creation it replies `bot.payCreated`
// with an inline URL button (`pay.cta`, url = Platega hosted page); the raw
// provider URL is never shown as text. Failures map to `bot.payError` only
// (never raw provider text, D-19/D-24).
// ---------------------------------------------------------------------------

/**
 * Create an order through the shared service and reply the keyed "invoice
 * created" message with the Platega URL button. Returns the created order id,
 * or null on a provider failure (the caller has already replied `bot.payError`).
 */
async function createBotOrderAndReply(
  ctx: {
    from?: { id: number };
    chat?: { id: number };
    reply: (text: string, extra?: Record<string, unknown>) => Promise<unknown>;
  },
  input: {
    kind: "new" | "renew" | "upgrade";
    days: number | null;
    devices: number;
    addDevices?: number;
    keyId?: string | null;
  },
): Promise<string | null> {
  const from = ctx.from;
  if (!from) return null;
  // Stashed bot promo (`/promo CODE`): passed to the shared pipeline, which
  // re-validates + consumes. Cleared only on a created order — an invalid
  // code fails the order with the generic pay error and the stash survives
  // for correction (same fail-closed discipline as the cabinet).
  const stashed = await prisma.user.findUnique({
    where: { telegramId: BigInt(from.id) },
    select: { id: true, pendingPromo: true },
  });
  try {
    const result = await createOrder({
      telegramId: from.id,
      kind: input.kind,
      days: input.days,
      devices: input.devices,
      ...(input.addDevices === undefined ? {} : { addDevices: input.addDevices }),
      keyId: input.keyId ?? null,
      userName: from.id ? String(from.id) : null,
      promoCode: stashed?.pendingPromo ?? null,
      channel: "bot",
    });
    if (result.kind === "provider_error") {
      await ctx.reply(t("bot.payError"));
      return null;
    }
    if (stashed?.pendingPromo && stashed.id) {
      await prisma.user
        .update({ where: { id: stashed.id }, data: { pendingPromo: null } })
        .catch(() => undefined);
    }
    await ctx.reply(t("bot.payCreated"), {
      reply_markup: { inline_keyboard: withMenu([[buildPayButton(result.url)]]) },
    });
    return result.order.id;
  } catch {
    await ctx.reply(t("bot.payError"));
    return null;
  }
}

// «Купить» — creates a `kind:'new'` order (days+devices from the tariff picker).
bot.action(/^tariff:buy:(\d+):(\d+)$/, async (ctx) => {
  const from = ctx.from;
  await ctx.answerCbQuery();
  if (!from) return;
  const days = Number(ctx.match?.[1]);
  const devices = Number(ctx.match?.[2]);
  await createBotOrderAndReply(ctx, { kind: "new", days, devices });
  logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "pay-created" });
});



// Renew/upgrade entry from a non-trial key (D-44): trial keys get only the
// existing `key.buyCta` deep-link — renew/upgrade are never offered (DOM-absent
// in the cabinet, absent from the bot keyboard here).
//
// A7: the callback carries the KEY ID (`key:renew:{keyId}`), not a list index,
// because an expiry reminder is delivered asynchronously and the list may have
// shifted by the time the button is tapped. The id is re-resolved through the
// ownership + trial pre-check server-side, so a forged/foreign id can never
// reach a provider call (T-04-34).
const KEY_DAYS = 30; // renew term default (the cabinet renew panel offers 7/30/90)

bot.action(/^key:renew:(.+)$/, async (ctx) => {
  const from = ctx.from;
  await ctx.answerCbQuery();
  if (!from) return;
  const keyId = ctx.match?.[1];
  if (!keyId) {
    await ctx.reply(t("key.linkUnavailable"));
    return;
  }
  // Server-side ownership + trial pre-check before any provider call (D-44).
  const precheck = await precheckOwnedKey(from.id, keyId);
  if (!precheck.ok) {
    await ctx.reply(precheck.reason === "trial" ? t("key.buyCta") : t("key.linkUnavailable"));
    return;
  }
  await createBotOrderAndReply(ctx, {
    kind: "renew",
    days: KEY_DAYS,
    devices: keyDeviceLimit(precheck.key),
    keyId: precheck.key.id,
  });
});

bot.action(/^key:upgrade:(.+)$/, async (ctx) => {
  const from = ctx.from;
  await ctx.answerCbQuery();
  if (!from) return;
  const keyId = ctx.match?.[1];
  if (!keyId) {
    await ctx.reply(t("key.linkUnavailable"));
    return;
  }
  const precheck = await precheckOwnedKey(from.id, keyId);
  if (!precheck.ok) {
    await ctx.reply(precheck.reason === "trial" ? t("key.buyCta") : t("key.linkUnavailable"));
    return;
  }
  await createBotOrderAndReply(ctx, {
    kind: "upgrade",
    days: null,
    devices: keyDeviceLimit(precheck.key),
    addDevices: 1,
    keyId: precheck.key.id,
  });
});


// (cache-first, D-29). Reply from the local mirror, then refresh from ARTEMIDA
// in the background; every string resolves through t() (D-16), never raw
// provider data. The key-detail / subscription-link message is added in 02-05.
bot.action("menu:keys", async (ctx) => {
  await ctx.answerCbQuery();
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

    // Expired, non-renewed subscriptions are NOT listed: their link is dead,
    // so showing it only produces "link unavailable" taps.
    const active = cached.filter((key) => key.statusKind !== "expired");
    if (active.length === 0) {
      await showPanel(ctx, t("bot.keysNoActive"));
      return;
    }

    const shown = active.slice(0, 10);
    const header =
      active.length >= 2
        ? `${t("bot.keysTitle")} · ${tp("subs.count", active.length)}`
        : t("bot.keysTitle");
    const lines = shown.map((key) => {
      const expiry = key.expiresAt ? formatKeyDate(key.expiresAt) : "—";
      const devices =
        key.devices !== null && key.deviceLimit !== null
          ? t("key.devicesCount", { n: key.devices, max: key.deviceLimit })
          : "—";
      return `${key.label ?? key.name ?? key.id}\n${statusLabel(key.statusKind, key.expiresAt)} · ${t("key.expires", {
        date: expiry,
      })}\n${devices}`;
    });
    // One inline control per key opens its subscription link (02-05 / CAB-04).
    // The callback carries the KEY ID: the list hides expired keys, so a
    // positional index no longer matches the stored order.
    const keyboard = shown.map((key) => [
      {
        text: `${key.label ?? key.name ?? key.id} · ${t("key.linkTitle")}`,
        callback_data: `key:link:${key.id}`,
      },
    ]);
    // Cap the message well under Telegram's 4096-char limit.
    await showPanel(ctx, [header, ...lines].join("\n\n").slice(0, 4000), {
      reply_markup: { inline_keyboard: withMenu(keyboard) },
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
bot.action(/^key:link:(.+)$/, async (ctx) => {
  const from = ctx.from;
  await ctx.answerCbQuery();
  if (!from) return;
  const telegramId = BigInt(from.id);
  try {
    const keys = await listKeys(telegramId);
    const rawId = ctx.match?.[1] ?? "";
    // Legacy messages carried a positional index; resolve by id first.
    const key =
      keys.find((row) => row.id === rawId) ??
      (/^\d+$/.test(rawId) ? keys[Number(rawId)] : undefined);
    if (!key) {
      await showPanel(ctx, t("key.linkUnavailable"));
      return;
    }
    // An expired, non-renewed subscription has no usable link — never show one.
    if (key.statusKind === "expired") {
      await showPanel(ctx, t("bot.keyExpired"));
      return;
    }
    // Fresh provider read with the cached link as a fallback: a provider blip
    // must not hide a subscription the user already paid for.
    let subscriptionUrl: string | null = key.subscriptionUrl ?? null;
    try {
      const subscription = await getSubscriptionForUser(telegramId, key.id);
      if (subscription?.subscriptionUrl) subscriptionUrl = subscription.subscriptionUrl;
    } catch {
      logger.warn({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "key-link-fetch-failed",
      });
    }
    if (!subscriptionUrl) {
      await showPanel(ctx, t("key.linkUnavailable"));
      logger.info({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "key-link-unavailable",
      });
      return;
    }
    // Non-trial keys also get renew/upgrade entry points on the link message;
    // trial keys keep only the buy deep-link (D-44 — no renew/upgrade at all).
    // A7: renew/upgrade callbacks carry the key id (never a list index) so a
    // button opened later still targets the right key.
    const limit = keyDeviceLimit(key);
    const actionRows: InlineButton[][] = key.isTrial
      ? []
      : [
          [{ text: t("renew.cta"), callback_data: `key:renew:${key.id}` }],
          ...(limit < 10
            ? [[{ text: t("upgrade.cta"), callback_data: `key:upgrade:${key.id}` }]]
            : []),
        ];
    // The URL travels as TEXT: Telegram rejects non-http(s) button URLs, and
    // `v2rayng://import?...` failed the whole message with BUTTON_URL_INVALID.
    await showPanel(ctx, t("bot.keySubscriptionLink", { url: subscriptionUrl }), {
      reply_markup: {
        inline_keyboard: withMenu([
          [{ text: t("bot.guidesOnSite"), url: installPageUrl() }],
          ...actionRows,
        ]),
      },
      link_preview_options: { is_disabled: true },
    });
    logger.info({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "key-link-sent" });
  } catch {
    await ctx.reply(t("key.linkError"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from.id, outcome: "key-link-failed" });
  }
});

// Legal pages live on the public site (APP_BASE_URL points at the cabinet).
// Reply-keyboard buttons cannot carry URLs, so each menu tap answers with the
// document link.
bot.action("menu:privacy", async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(
    ctx,
    t("bot.legalLink", {
      title: t("bot.menuPrivacy"),
      url: `${env.LEGAL_BASE_URL}/privacy`,
    }),
    { reply_markup: { inline_keyboard: withMenu([]) } },
  );
});

bot.action("menu:terms", async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(
    ctx,
    t("bot.legalLink", {
      title: t("bot.menuTerms"),
      url: `${env.LEGAL_BASE_URL}/terms`,
    }),
    { reply_markup: { inline_keyboard: withMenu([]) } },
  );
});

bot.action("menu:help", async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(ctx, t("bot.helpText"), {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: withMenu([]) },
  });
});

bot.action("menu:share", async (ctx) => {
  await ctx.answerCbQuery();
  const from = ctx.from;
  const botBase = `https://t.me/${env.TELEGRAM_BOT_USERNAME}`;
  // Share the caller's personal referral link so an invited friend is pinned
  // to them. Falls back to the plain bot link for a missing user row.
  let shareUrl = botBase;
  if (from) {
    try {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(from.id) },
        select: { id: true },
      });
      if (user) shareUrl = `${botBase}?start=${await ensureReferralCode(user.id)}`;
    } catch {
      // A lookup failure must not break sharing — plain bot link is fine.
    }
  }
  const text = t("bot.shareText", { botUrl: shareUrl });
  // `t.me/share/url` opens Telegram's native share sheet. `switch_inline_query`
  // needs inline mode enabled in BotFather, so it silently did nothing here.
  const shareHref = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
  await showPanel(ctx, text, {
    reply_markup: {
      inline_keyboard: withMenu([[{ text: t("bot.shareButton"), url: shareHref }]]),
    },
    link_preview_options: { is_disabled: true },
  });
});

// TRIAL-03 bot half: «Инструкции» shows EVERY app for the chosen platform in
// one message — install link, steps, and an import button when an active
// subscription exists. A platform tap is the only tap: the old second "pick an
// app" step was a dead end.
bot.action("menu:guides", async (ctx) => {
  await ctx.answerCbQuery();
  await showPanel(ctx, t("bot.guidesTitle"), {
    reply_markup: {
      inline_keyboard: withMenu([
        [{ text: t("bot.guidesPlatformAndroid"), callback_data: "guides:platform:android" }],
        [{ text: t("bot.guidesPlatformIOS"), callback_data: "guides:platform:ios" }],
        [{ text: t("bot.guidesPlatformDesktop"), callback_data: "guides:platform:desktop" }],
        [{ text: t("bot.guidesOnSite"), url: installPageUrl() }],
      ]),
    },
  });
});

bot.action(/^guides:platform:(android|ios|desktop)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const raw = ctx.match?.[1] ?? "";
  if (!isGuidePlatform(raw)) return;
  const from = ctx.from;
  const subscriptionUrl = from
    ? await activeSubscriptionUrl(BigInt(from.id)).catch(() => null)
    : null;
  const { text, keyboard } = guidePlatformMessage(raw, subscriptionUrl, installPageUrl());
  try {
    await showPanel(ctx, text, {
      reply_markup: { inline_keyboard: withMenu(keyboard) },
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch {
    await ctx.reply(t("bot.guidesError"));
    logger.warn({ updateId: ctx.update.update_id, telegramId: from?.id, outcome: "guides-failed" });
  }
});

// ---------------------------------------------------------------------------
// Phase 4 — support intake (SUP-01/SUP-02, D-51/Q3 create-only).
//
// «Поддержка» arms a persisted `awaitingSupport` flag (30-min TTL); the NEXT
// text/photo is offered to the SAME `lib/tickets-service.createTicket` the
// cabinet uses, so both channels share one queue and one attachment contract.
// A photo is downloaded through the Bot API (`getFileLink` → `fetch`) and
// normalized by the shared `lib/attachments.normalizeImage`. Failures reply
// keyed copy only — never a provider/API error or the file link (D-19/D-24).
bot.action("menu:support", async (ctx) => {
  await ctx.answerCbQuery();
  const from = ctx.from;
  if (!from) return;
  try {
    await beginSupportPrompt(BigInt(from.id));
    await showPanel(ctx, t("bot.supportPrompt"), {
      reply_markup: { inline_keyboard: withMenu([]) },
    });
    logger.info({
      updateId: ctx.update.update_id,
      telegramId: from.id,
      outcome: "support-armed",
    });
  } catch {
    await ctx.reply(t("bot.ticketError"));
    logger.warn({
      updateId: ctx.update.update_id,
      telegramId: from.id,
      outcome: "support-arm-failed",
    });
  }
});

// Registered AFTER every `hears` menu branch (Telegraf matches middleware in
// registration order) so a menu tap is consumed by its own handler; only an
// unmatched text or any photo reaches here. The flag + TTL gate keeps ordinary
// chatter and photos falling through untouched.
bot.on(["text", "photo"], async (ctx) => {
  const from = ctx.from;
  const message = ctx.message;
  if (!from || !message) return;
  const telegramId = BigInt(from.id);

  // Gate: read the persisted state, then fall through (no reply, no consume)
  // unless armed AND still fresh. `clearSupportPrompt` re-checks freshness
  // atomically, so a stale row can never be claimed.
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { awaitingSupport: true, supportPromptAt: true },
  });
  if (!isSupportIntakeArmed(user)) return;

  // Claim-before-create: the single-winner claim (04-01) runs BEFORE any
  // download/create. A retried/concurrent duplicate reads `false` and creates
  // nothing — exactly one ticket per armed prompt. The flag is NOT re-armed on
  // failure (a fresh «Поддержка» tap re-arms), the deliberate create-only
  // tradeoff (D-51/Q3).
  const claimed = await clearSupportPrompt(telegramId);
  if (!claimed) return;

  try {
    const photos = "photo" in message ? message.photo : undefined;
    let attachment: AttachmentDescriptor | null = null;
    if (photos && photos.length > 0) {
      const largest = photos[photos.length - 1];
      const link = await ctx.telegram.getFileLink(largest.file_id);
      const res = await fetch(link);
      if (!res.ok) throw new Error("telegram_file_fetch_failed");
      const bytes = Buffer.from(await res.arrayBuffer());
      const normalized = await normalizeImage(bytes);
      // The ticket id is created by the service, so store under a PII-free
      // per-photo scope and pass only the descriptor (relative path) in.
      const storedPath = await saveAttachment(`bot-${randomUUID()}`, normalized);
      attachment = {
        path: storedPath,
        mime: normalized.mime,
        sizeBytes: normalized.sizeBytes,
        width: normalized.width,
        height: normalized.height,
      };
    }

    // Subject ≤120 / body ≤4000; a caption-less photo falls back to a keyed
    // subject rather than echoing provider text.
    const { subject, body } = buildSupportTicketContent(
      "text" in message ? { text: message.text } : { caption: message.caption },
      t("bot.menuSupport"),
    );

    const result = await createTicket({ telegramId, subject, body, attachment });
    if (result.kind === "created") {
      await ctx.reply(t("bot.ticketCreated"));
      logger.info({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "support-created",
      });
    } else {
      await ctx.reply(t("bot.ticketError"));
      logger.warn({
        updateId: ctx.update.update_id,
        telegramId: from.id,
        outcome: "support-no-user",
      });
    }
  } catch {
    await ctx.reply(t("bot.ticketError"));
    logger.warn({
      updateId: ctx.update.update_id,
      telegramId: from.id,
      outcome: "support-failed",
    });
  }
});

// Polling guard: dev only, test token (selected above), never during
// `next build` module collection, never in webhook (prod) mode.
//
// `bot.launch()` RESOLVES only when polling stops; a rejected launch (Telegram
// 409 «terminated by other getUpdates request» — a restart overlap, a stray
// probe, a second instance — or a network blip) would otherwise leave the bot
// silently dead until the container is restarted. Re-entering the loop after a
// short delay is what makes the poller self-healing.
const POLLING_RETRY_MS = 5_000;

async function pollForever(): Promise<void> {
  for (;;) {
    try {
      await bot.launch();
      logger.warn({ outcome: "bot-polling-stopped" });
    } catch (err: unknown) {
      logger.error({ outcome: "bot-polling-failed", err });
    }
    await new Promise((resolve) => setTimeout(resolve, POLLING_RETRY_MS));
  }
}

if (env.BOT_MODE === "polling" && process.env["NEXT_PHASE"] !== "phase-production-build") {
  const g = globalThis as unknown as { __setwhiteBotLaunched?: boolean };
  if (!g.__setwhiteBotLaunched) {
    g.__setwhiteBotLaunched = true;
    void pollForever();
  }
}
