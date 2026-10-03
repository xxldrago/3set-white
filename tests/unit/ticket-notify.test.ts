// Ticket-reply notification vectors (SUP-03 / D-57):
// - the keyed copy builder prefixes `bot.ticketReply` and is sliced to
//   `BOT_REPLY_CAP` (T-04-13 reply-overflow);
// - the worker dispatch resolves the OWNING chat server-side
//   (`String(user.chatId ?? user.telegramId)`) and can never be pointed at any
//   other chat (T-04-10 information disclosure);
// - a Telegram send failure is retryable; a missing row is skipped.
// Runs against the real local Postgres; no network is touched (fake sender).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOT_REPLY_CAP } from "../../lib/bot-payments";
import { prisma } from "../../lib/prisma";
import {
  buildReminderPush,
  buildTicketReplyPush,
  dispatchReminder,
  dispatchTicketNotification,
} from "../../lib/ticket-notify";
import { fakeSender } from "../helpers/fake-sender";

const OWNER_WITH_CHAT = BigInt("200000910");
const OWNER_NO_CHAT = BigInt("200000911");
const PREFIX = "test-04-03:";

let withChatUserId: number;
let noChatUserId: number;

/** Seed an owning user → ticket → support message; returns the message id. */
async function seedSupportMessage(
  userId: number,
  suffix: string,
): Promise<{ ticketId: string; messageId: string }> {
  const ticket = await prisma.ticket.create({
    data: {
      userId,
      subject: `subject-${suffix}`,
      status: "answered",
    },
    select: { id: true },
  });
  const message = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, author: "support", body: `reply-${suffix}` },
    select: { id: true },
  });
  return { ticketId: ticket.id, messageId: message.id };
}

/** Enqueue a notification row directly (Task 2 owns `enqueueNotification`). */
async function seedNotification(
  userId: number,
  ticketId: string,
  ticketMessageId: string | null,
  suffix: string,
): Promise<string> {
  const row = await prisma.notification.create({
    data: {
      type: "notify-ticket-reply",
      dedupeKey: `${PREFIX}reply:${suffix}`,
      userId,
      ticketId,
      ticketMessageId,
    },
    select: { id: true },
  });
  return row.id;
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: [OWNER_WITH_CHAT, OWNER_NO_CHAT] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.ticket.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { telegramId: { in: [OWNER_WITH_CHAT, OWNER_NO_CHAT] } } });
}

beforeAll(async () => {
  await cleanup();
  const withChat = await prisma.user.create({
    data: { telegramId: OWNER_WITH_CHAT, chatId: OWNER_WITH_CHAT },
    select: { id: true },
  });
  withChatUserId = withChat.id;
  const noChat = await prisma.user.create({
    data: { telegramId: OWNER_NO_CHAT },
    select: { id: true },
  });
  noChatUserId = noChat.id;
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
  await prisma.ticket.deleteMany({ where: { userId: { in: [withChatUserId, noChatUserId] } } });
  await prisma.keyCache.deleteMany({
    where: { userId: { in: [withChatUserId, noChatUserId] } },
  });
});

/** Enqueue a reminder notification row directly (the scan owns enqueue in prod). */
async function seedReminderNotification(
  userId: number,
  keyId: string,
  suffix: string,
): Promise<string> {
  const row = await prisma.notification.create({
    data: {
      type: "remind-expiry",
      dedupeKey: `${PREFIX}remind:${suffix}`,
      userId,
      keyId,
    },
    select: { id: true },
  });
  return row.id;
}

/** Seed one cached key for a user; returns the key id. */
async function seedReminderKey(userId: number, keyId: string): Promise<void> {
  await prisma.keyCache.create({
    data: {
      userId,
      keyId,
      status: "active",
      expiresAt: new Date(Date.now() + 86_400_000),
      customerRef: String(userId),
    },
  });
}

describe("buildTicketReplyPush (SUP-03 / T-04-13)", () => {
  it("prefixes the keyed support-reply copy and stays within BOT_REPLY_CAP", () => {
    const push = buildTicketReplyPush("x".repeat(5000));
    expect(push.startsWith("Ответ поддержки:")).toBe(true);
    expect(push.length).toBeLessThanOrEqual(BOT_REPLY_CAP);
  });

  it("keeps a short body verbatim after the keyed prefix", () => {
    expect(buildTicketReplyPush("Здравствуйте!")).toBe("Ответ поддержки:\nЗдравствуйте!");
  });
});

describe("dispatchTicketNotification — owning-chat targeting (SUP-03 / T-04-10)", () => {
  it("sends to the stored chatId of the owning user", async () => {
    const { ticketId, messageId } = await seedSupportMessage(withChatUserId, "chat");
    const notificationId = await seedNotification(
      withChatUserId,
      ticketId,
      messageId,
      "chat",
    );
    const sender = fakeSender();

    const result = await dispatchTicketNotification(notificationId, sender);

    expect(result.outcome).toBe("pushed");
    expect(sender.calls).toHaveLength(1);
    expect(String(sender.calls[0]?.chatId)).toBe(String(OWNER_WITH_CHAT));
    expect(sender.calls[0]?.text).toContain("Ответ поддержки:");
  });

  it("falls back to telegramId when the owning user has no stored chatId", async () => {
    const { ticketId, messageId } = await seedSupportMessage(noChatUserId, "nochat");
    const notificationId = await seedNotification(noChatUserId, ticketId, messageId, "nochat");
    const sender = fakeSender();

    const result = await dispatchTicketNotification(notificationId, sender);

    expect(result.outcome).toBe("pushed");
    expect(String(sender.calls[0]?.chatId)).toBe(String(OWNER_NO_CHAT));
  });

  it("can never deliver to a chat other than the owner row's value", async () => {
    const { ticketId, messageId } = await seedSupportMessage(withChatUserId, "other");
    const notificationId = await seedNotification(withChatUserId, ticketId, messageId, "other");
    const sender = fakeSender();

    await dispatchTicketNotification(notificationId, sender);

    expect(String(sender.calls[0]?.chatId)).not.toBe(String(OWNER_NO_CHAT));
  });

  it("returns retryable_error (never drops) when the Telegram send throws", async () => {
    const { ticketId, messageId } = await seedSupportMessage(withChatUserId, "fail");
    const notificationId = await seedNotification(withChatUserId, ticketId, messageId, "fail");
    const sender = fakeSender({ fail: true });

    const result = await dispatchTicketNotification(notificationId, sender);

    expect(result.outcome).toBe("retryable_error");
    expect(sender.calls).toHaveLength(0);
  });

  it("returns skipped when the notification row is missing", async () => {
    const result = await dispatchTicketNotification("cuid_missing", fakeSender());
    expect(result.outcome).toBe("skipped");
  });

  it("returns skipped when the notification references no ticket message", async () => {
    const { ticketId } = await seedSupportMessage(withChatUserId, "nomsg");
    const notificationId = await seedNotification(withChatUserId, ticketId, null, "nomsg");

    const result = await dispatchTicketNotification(notificationId, fakeSender());

    expect(result.outcome).toBe("skipped");
  });

  it("returns skipped when the referenced message has vanished", async () => {
    const { ticketId, messageId } = await seedSupportMessage(withChatUserId, "gone");
    const notificationId = await seedNotification(withChatUserId, ticketId, messageId, "gone");
    await prisma.ticketMessage.delete({ where: { id: messageId } });

    const result = await dispatchTicketNotification(notificationId, fakeSender());

    expect(result.outcome).toBe("skipped");
  });
});

describe("buildReminderPush — signal selection (D-62/D-63 / T-04-36)", () => {
  const expires = new Date("2026-07-15T00:00:00Z");
  // A cuid-shaped key id: proves the callback carries an id, not a list index.
  const CUID_KEY = "clx9k2j4b0000abcd1234efgh";

  it("gives a trial key the buy CTA (tariff:start) and NEVER a renew callback", () => {
    const push = buildReminderPush({ keyId: CUID_KEY, isTrial: true, expiresAt: expires });
    const keyboard = JSON.stringify(push.keyboard);

    expect(keyboard).toContain("tariff:start");
    expect(keyboard).not.toContain("key:renew:");
    expect(push.text).toContain("Trial-период заканчивается");
  });

  it("gives a non-trial key an exact key:renew:{keyId} callback", () => {
    const push = buildReminderPush({ keyId: CUID_KEY, isTrial: false, expiresAt: expires });

    expect(push.keyboard.inline_keyboard[0]?.[0]?.callback_data).toBe(`key:renew:${CUID_KEY}`);
    expect(push.text).toContain("Подписка истекает");
    // The reminder copy must never leak the raw key id.
    expect(push.text).not.toContain(CUID_KEY);
  });
});

describe("dispatchReminder — owning-chat targeting (PAY-05 / T-04-35)", () => {
  it("sends to the stored chatId of the owning user with the reminder copy", async () => {
    const keyId = "test-04-08-tn-chat";
    await seedReminderKey(withChatUserId, keyId);
    const notificationId = await seedReminderNotification(withChatUserId, keyId, "chat");
    const sender = fakeSender();

    const result = await dispatchReminder(notificationId, sender);

    expect(result.outcome).toBe("pushed");
    expect(sender.calls).toHaveLength(1);
    expect(String(sender.calls[0]?.chatId)).toBe(String(OWNER_WITH_CHAT));
    expect(sender.calls[0]?.text).toContain("Подписка истекает");
  });

  it("falls back to telegramId when the owning user has no stored chatId", async () => {
    const keyId = "test-04-08-tn-nochat";
    await seedReminderKey(noChatUserId, keyId);
    const notificationId = await seedReminderNotification(noChatUserId, keyId, "nochat");
    const sender = fakeSender();

    const result = await dispatchReminder(notificationId, sender);

    expect(result.outcome).toBe("pushed");
    expect(String(sender.calls[0]?.chatId)).toBe(String(OWNER_NO_CHAT));
  });

  it("returns retryable_error (never drops) when the Telegram send throws", async () => {
    const keyId = "test-04-08-tn-fail";
    await seedReminderKey(withChatUserId, keyId);
    const notificationId = await seedReminderNotification(withChatUserId, keyId, "fail");
    const sender = fakeSender({ fail: true });

    const result = await dispatchReminder(notificationId, sender);

    expect(result.outcome).toBe("retryable_error");
    expect(sender.calls).toHaveLength(0);
  });

  it("returns skipped when the key row is missing", async () => {
    const notificationId = await seedReminderNotification(
      withChatUserId,
      "test-04-08-tn-gone",
      "gone",
    );

    const result = await dispatchReminder(notificationId, fakeSender());

    expect(result.outcome).toBe("skipped");
  });
});
