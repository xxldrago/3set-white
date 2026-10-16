// Email hooks for tickets / reminders / purchases.
//
// Templates render the right subject/tag/body through the fake transport;
// hooks fire-and-forget (mail failures never break flows); users without
// email get nothing; the purchase receipt sends exactly once (gated on the
// provisioning transition, so worker retries never resend).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { artemida, type NormalizedKey } from "../../lib/artemida";
import {
  sendExpiryReminderMail,
  sendPurchaseMail,
  sendTicketCreatedMail,
  sendTicketReplyMail,
  setMailTransportForTests,
  type MailMessage,
} from "../../lib/mail";
import { enqueueFulfillJob } from "../../lib/outbox";
import { prisma } from "../../lib/prisma";
import { dispatchReminder } from "../../lib/ticket-notify";
import { addSupportMessage, createTicketByUserId } from "../../lib/tickets-service";
import { drainOutbox } from "../../lib/worker";
import { fakeSender } from "../helpers/fake-sender";

const TG = BigInt("200000950");
const REPLY_TG = BigInt("200000955");
const NO_MAIL_TG = BigInt("200000951");

let sent: MailMessage[] = [];
let failSends = false;

function providerKey(id: string): NormalizedKey {
  return {
    id,
    name: null,
    status: "ACTIVE",
    isTrial: false,
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    deviceLimit: 2,
    devices: 0,
    subscriptionUrl: `https://sub.test/${id}`,
    customerRef: "test",
    trafficUsedBytes: null,
    trafficLimitBytes: null,
  };
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { telegramId: { in: [TG, NO_MAIL_TG, REPLY_TG, REMIND_TG, BUY_TG, BUY2_TG] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.ticket.deleteMany({ where: { userId: { in: ids } } });
    await prisma.order.deleteMany({ where: { userId: { in: ids } } });
    await prisma.keyCache.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { telegramId: { in: [TG, NO_MAIL_TG, REPLY_TG, REMIND_TG, BUY_TG, BUY2_TG] } },
  });
}

beforeAll(async () => {
  await cleanup();
  setMailTransportForTests({
    send: async (msg) => {
      if (failSends) throw new Error("smtp_down");
      sent.push(msg);
    },
  });
});

afterAll(async () => {
  setMailTransportForTests(null);
  await cleanup();
});

afterEach(() => {
  sent = [];
  failSends = false;
  vi.restoreAllMocks();
});

describe("mail templates", () => {
  it("renders ticket-created with thread link and tag", async () => {
    await sendTicketCreatedMail("u@example.test", "tick123456789", "Нет соединения");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("u@example.test");
    expect(sent[0]?.tag).toBe("ticket-created");
    expect(sent[0]?.subject).toContain("tick1234");
    expect(sent[0]?.text).toContain("Нет соединения");
    expect(sent[0]?.text).toContain("/support/tick123456789");
  });

  it("renders ticket-reply with a capped preview", async () => {
    await sendTicketReplyMail("u@example.test", "tick1", "Тема", "x".repeat(500));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tag).toBe("ticket-reply");
    expect(sent[0]?.text).toContain("…");
    expect(sent[0]?.text).toContain("/support/tick1");
  });

  it("renders expiry reminder with date and cabinet link", async () => {
    await sendExpiryReminderMail("u@example.test", "Мой ключ", "2026-12-31T00:00:00.000Z", false);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tag).toBe("expiry");
    expect(sent[0]?.subject).toContain("заканчивается");
    expect(sent[0]?.text).toContain("/subscription");
  });

  it("renders purchase receipt with subscription data", async () => {
    await sendPurchaseMail("u@example.test", {
      kind: "new",
      keyId: "key-1",
      devices: 2,
      days: 30,
      amount: 299,
      currency: "RUB",
      subscriptionUrl: "https://sub.test/key-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
      orderId: "order-1",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tag).toBe("purchase");
    expect(sent[0]?.text).toContain("https://sub.test/key-1");
    expect(sent[0]?.text).toContain("299 RUB");
    expect(sent[0]?.text).toContain("/payments/order-1");
  });
});

describe("ticket email hooks", () => {
  it("emails on ticket creation when the user has an email", async () => {
    const user = await prisma.user.create({
      data: { telegramId: TG, email: "ticket-user@example.test" },
      select: { id: true },
    });
    const result = await createTicketByUserId({
      userId: user.id,
      subject: "Проблема",
      body: "Не работает",
    });
    expect(result.kind).toBe("created");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.tag).toBe("ticket-created");
    expect(sent[0]?.to).toBe("ticket-user@example.test");
  });

  it("creates the ticket with no email when the user is Telegram-only", async () => {
    const user = await prisma.user.create({
      data: { telegramId: NO_MAIL_TG },
      select: { id: true },
    });
    const result = await createTicketByUserId({
      userId: user.id,
      subject: "Проблема",
      body: "Не работает",
    });
    expect(result.kind).toBe("created");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(0);
  });

  it("emails the owner on a support reply, and survives mail failure", async () => {
    const user = await prisma.user.create({
      data: { telegramId: REPLY_TG, email: "reply-user@example.test" },
      select: { id: true },
    });
    const created = await createTicketByUserId({
      userId: user.id,
      subject: "Тема",
      body: "Вопрос",
    });
    if (created.kind !== "created") throw new Error("seed failed");
    sent = [];

    const message = await addSupportMessage(created.id, "Ответ поддержки");
    expect(message).not.toBeNull();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.tag).toBe("ticket-reply");
    expect(sent[0]?.to).toBe("reply-user@example.test");

    // A dead mailer must not fail the reply itself.
    failSends = true;
    sent = [];
    const retry = await addSupportMessage(created.id, "Ещё ответ");
    expect(retry).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(0);
  });
});

const REMIND_TG = BigInt("200000952");

describe("reminder email hook", () => {
  it("sends the expiry email alongside the bot push", async () => {
    const user = await prisma.user.create({
      data: { telegramId: REMIND_TG, chatId: REMIND_TG, email: "remind-user@example.test" },
      select: { id: true },
    });
    await prisma.keyCache.create({
      data: {
        userId: user.id,
        keyId: "test-mail-remind-key",
        status: "active",
        expiresAt: new Date(Date.now() + 86_400_000),
        customerRef: String(REMIND_TG),
      },
    });
    const notification = await prisma.notification.create({
      data: {
        type: "remind-expiry",
        dedupeKey: "test-mail-remind:1",
        userId: user.id,
        keyId: "test-mail-remind-key",
      },
      select: { id: true },
    });
    const sender = fakeSender();

    const result = await dispatchReminder(notification.id, sender);

    expect(result.outcome).toBe("pushed");
    expect(sender.calls).toHaveLength(1);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.tag).toBe("expiry");
    expect(sent[0]?.to).toBe("remind-user@example.test");
  });
});

const BUY_TG = BigInt("200000953");
const BUY2_TG = BigInt("200000954");

describe("purchase email hook", () => {
  it("sends the receipt once, never on retry", async () => {
    const user = await prisma.user.create({
      data: { telegramId: BUY_TG, email: "buyer@example.test" },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 299,
        finalAmount: 299,
        currency: "RUB",
        status: "paid",
      },
      select: { id: true },
    });
    await enqueueFulfillJob(order.id);
    vi.spyOn(artemida, "createKey").mockResolvedValue(providerKey("prov-key-1"));

    await drainOutbox();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.tag).toBe("purchase");
    expect(sent[0]?.to).toBe("buyer@example.test");
    expect(sent[0]?.text).toContain("https://sub.test/prov-key-1");

    // A second drain finds the terminal order and sends nothing more.
    await drainOutbox();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(1);
  });

  it("still provisions when the mailer is down", async () => {
    failSends = true;
    const user = await prisma.user.create({
      data: { telegramId: BUY2_TG, email: "buyer2@example.test" },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 299,
        finalAmount: 299,
        currency: "RUB",
        status: "paid",
      },
      select: { id: true },
    });
    await enqueueFulfillJob(order.id);
    vi.spyOn(artemida, "createKey").mockResolvedValue(providerKey("prov-key-2"));

    await drainOutbox();
    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    expect(fresh?.status).toBe("provisioned");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sent).toHaveLength(0);
  });
});
