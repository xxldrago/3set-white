// Bot payment-parity vectors (PAY-01/PAY-04, UI-SPEC §6/§7): the bot's payment
// entry points, history reply, and provisioned/failed notifications reuse the
// SAME pure helpers the handlers call, so they can be asserted without a live
// Telegram context or a network. Covers:
// - the history reply formatting (kind · amount · date · status), newest first,
//   empty-state key, and the 4096-char cap (T-03-reply-overflow);
// - the Platega URL button shape (label = pay.cta, url carried, never raw text);
// - the provisioned/failed notification message builders (keyed copy + PNG
//   attachment intent; no raw provider text);
// - the worker's notify-row dispatch to the owning chat only (T-03-sublink-leak).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { artemida } from "../../lib/artemida";
import {
  buildHistoryReply,
  buildPayButton,
  buildProvisionedPush,
  buildFailedPush,
  dispatchNotification,
  type OrderRowLike,
} from "../../lib/bot-payments";
import { NOTIFY_FAILED, NOTIFY_PROVISIONED, enqueueOrderJob } from "../../lib/outbox";
import { prisma } from "../../lib/prisma";
import { drainOutbox } from "../../lib/worker";

const OWNER = BigInt("200000710");

let userId: number;

const DAY = 86_400_000;

function row(overrides: Partial<OrderRowLike> = {}): OrderRowLike {
  return {
    id: "order_1",
    amount: 350,
    currency: "RUB",
    status: "provisioned",
    kind: "new",
    keyId: "key_abc",
    createdAt: new Date("2026-09-01T10:30:00.000Z"),
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { telegramId: OWNER },
    select: { id: true },
  });
  if (user) {
    await prisma.outbox.deleteMany({ where: { order: { userId: user.id } } });
    await prisma.order.deleteMany({ where: { userId: user.id } });
    await prisma.keyCache.deleteMany({ where: { userId: user.id } });
  }
  await prisma.user.deleteMany({ where: { telegramId: OWNER } });
}

beforeAll(async () => {
  await cleanup();
  const user = await prisma.user.create({
    data: { telegramId: OWNER, chatId: OWNER },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

beforeEach(async () => {
  await prisma.outbox.deleteMany({ where: { order: { userId } } });
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.keyCache.deleteMany({ where: { userId } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildHistoryReply — bot payment history (PAY-04 / D-47/D-48)", () => {
  it("renders one keyed row per order: kind · amount · date · status", () => {
    const reply = buildHistoryReply([row({ kind: "renew", amount: 250, status: "provisioned" })]);

    expect(reply).toContain("Продление");
    expect(reply).toContain("250 ₽");
    expect(reply).toContain("Готово");
    // The mapped date carries day + time (DD.MM.YYYY · HH:mm).
    expect(reply).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    // The raw order kind / status strings are never rendered.
    expect(reply).not.toContain("renew");
    expect(reply).not.toContain("provisioned");
  });

  it("returns the empty-state key when the user has no orders", () => {
    const reply = buildHistoryReply([]);
    expect(reply).toContain("Платежей пока нет");
  });

  it("keeps the reply under Telegram's 4096-char limit even with many long rows", () => {
    const rows = Array.from({ length: 200 }, (_, i) =>
      row({ id: `order_${i}`, keyId: `key_${"x".repeat(60)}_${i}` }),
    );
    const reply = buildHistoryReply(rows);
    expect(reply.length).toBeLessThanOrEqual(4096);
  });
});

describe("buildPayButton — Platega URL button (UI-SPEC §7)", () => {
  it("labels the button with pay.cta and carries the hosted URL (no raw URL in text)", () => {
    const button = buildPayButton("https://pay.platega.test/abc");
    expect(button).toEqual({ text: "Перейти к оплате", url: "https://pay.platega.test/abc" });
  });
});

describe("notification message builders (UI-SPEC §7)", () => {
  it("provisioned push carries the keyed copy + the sub-link and requests a PNG attachment", () => {
    const push = buildProvisionedPush("https://sub.test/link/xyz");
    expect(push.text).toContain("Оплата прошла");
    expect(push.text).toContain("https://sub.test/link/xyz");
    expect(push.wantsQr).toBe(true);
  });

  it("provisioned push degrades to link-unavailable copy with no QR when the sub-link is missing", () => {
    const push = buildProvisionedPush(null);
    expect(push.text).toContain("Оплата прошла");
    expect(push.text).not.toContain("http");
    expect(push.wantsQr).toBe(false);
  });

  it("failed push carries only the keyed failure copy (no raw error text)", () => {
    const push = buildFailedPush();
    expect(push.text).toContain("Не удалось выдать ключ");
    expect(push.wantsQr).toBe(false);
  });
});

describe("dispatchNotification — worker notify-row consumer (PAY-01, D-38)", () => {
  it("pushes the provisioned key + generated QR to the owning chat and marks the row done", async () => {
    // Seed a provisioned order + a notify-provisioned row.
    const order = await prisma.order.create({
      data: {
        userId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 100,
        currency: "RUB",
        status: "provisioned",
        provisionedKeyId: "key_ok",
      },
    });
    await prisma.keyCache.create({
      data: {
        userId,
        keyId: "key_ok",
        name: null,
        status: "ACTIVE",
        isTrial: false,
        expiresAt: new Date(Date.now() + 30 * DAY),
        deviceLimit: 2,
        devices: 2,
        subscriptionUrl: "https://sub.test/link/key_ok",
        customerRef: String(OWNER),
      },
    });
    await enqueueOrderJob(order.id, NOTIFY_PROVISIONED);

    // The sub-link is resolved through the SAME provider read the cabinet uses.
    vi.spyOn(artemida, "getSubscriptionLinks").mockResolvedValue({
      subscriptionUrl: "https://sub.test/link/key_ok",
      links: ["https://sub.test/link/key_ok"],
    });
    vi.spyOn(artemida, "getTraffic").mockResolvedValue({ usedBytes: null, limitBytes: null });

    const sendPhoto = vi.fn().mockResolvedValue({ message_id: 1 });
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 2 });
    const telegram = { sendPhoto, sendMessage };

    await drainOutbox({ telegram: telegram as never });

    // The QR photo is generated locally and sent to the OWNING chat id only.
    expect(sendPhoto).toHaveBeenCalledTimes(1);
    const [photoChatId, photoArg, photoExtra] = sendPhoto.mock.calls[0] as [
      number | string,
      { source?: Buffer },
      { caption?: string },
    ];
    expect(String(photoChatId)).toBe(String(OWNER));
    expect(Buffer.isBuffer(photoArg.source)).toBe(true);
    // Caption is the keyed QR caption; the sub-link travels in the text message.
    expect(photoExtra.caption).toContain("Наведите камеру");

    // The sub-link text is pushed to the owning chat, never logged.
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [msgChatId, msgText] = sendMessage.mock.calls[0] as [number | string, string];
    expect(String(msgChatId)).toBe(String(OWNER));
    expect(msgText).toContain("https://sub.test/link/key_ok");

    // The notify row is consumed exactly once.
    const row_ = await prisma.outbox.findFirst({
      where: { orderId: order.id, type: NOTIFY_PROVISIONED },
    });
    expect(row_?.status).toBe("done");
  });

  it("pushes the failed copy for a notify-failed row and marks it done", async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 100,
        currency: "RUB",
        status: "failed",
        errorCode: "payment_required",
      },
    });
    await enqueueOrderJob(order.id, NOTIFY_FAILED);

    const sendPhoto = vi.fn().mockResolvedValue({ message_id: 1 });
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 2 });
    await drainOutbox({ telegram: { sendPhoto, sendMessage } as never });

    expect(sendPhoto).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, text] = sendMessage.mock.calls[0] as [number | string, string];
    expect(text).toContain("Не удалось выдать ключ");
    expect(text).not.toContain("payment_required");

    const row_ = await prisma.outbox.findFirst({
      where: { orderId: order.id, type: NOTIFY_FAILED },
    });
    expect(row_?.status).toBe("done");
  });

  it("leaves a notify row pending when no telegram sender is supplied (never dropped)", async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 100,
        currency: "RUB",
        status: "failed",
      },
    });
    await enqueueOrderJob(order.id, NOTIFY_FAILED);

    // A sender-less drain must not consume delivery rows.
    await drainOutbox();

    const row_ = await prisma.outbox.findFirst({
      where: { orderId: order.id, type: NOTIFY_FAILED },
    });
    expect(row_?.status).toBe("pending");
  });

  it("reschedules (not drops) a notify row when the Telegram send throws", async () => {
    const order = await prisma.order.create({
      data: {
        userId,
        kind: "new",
        days: 30,
        devices: 2,
        amount: 100,
        currency: "RUB",
        status: "failed",
      },
    });
    await enqueueOrderJob(order.id, NOTIFY_FAILED);

    const sendMessage = vi.fn().mockRejectedValue(new Error("telegram_down"));
    await drainOutbox({ telegram: { sendPhoto: vi.fn(), sendMessage } as never });

    const row_ = await prisma.outbox.findFirst({
      where: { orderId: order.id, type: NOTIFY_FAILED },
    });
    expect(row_?.status).toBe("pending");
    expect(row_?.attempts).toBe(1);
  });
});
