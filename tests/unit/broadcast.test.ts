import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { BOT_REPLY_CAP } from "../../lib/bot-payments";
import { dispatchBroadcast, deriveBroadcastStatus, loadBroadcastStatus } from "../../lib/broadcast";
import { BROADCAST, enqueueBroadcastNotifications } from "../../lib/outbox";
import { fakeSender } from "../helpers/fake-sender";

const TELEGRAM_ID = BigInt("500000901");
const PREFIX = "broadcast:test-05-03:";
let userId: number;

beforeAll(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
  await prisma.broadcast.deleteMany({ where: { id: { startsWith: "test-05-03-" } } });
  await prisma.user.deleteMany({ where: { telegramId: TELEGRAM_ID } });
  userId = (await prisma.user.create({ data: { telegramId: TELEGRAM_ID, chatId: TELEGRAM_ID } })).id;
});
beforeEach(async () => {
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
});
afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.broadcast.deleteMany({ where: { id: { startsWith: "test-05-03-" } } });
  await prisma.user.delete({ where: { id: userId } });
});

describe("broadcast queue and dispatch", () => {
  it("bulk enqueues deduped recipient rows", async () => {
    const broadcast = await prisma.broadcast.create({ data: { id: "test-05-03-dedupe", authorTelegramId: TELEGRAM_ID, body: "hello", total: 1 } });
    await enqueueBroadcastNotifications(broadcast.id, [userId, userId]);
    await enqueueBroadcastNotifications(broadcast.id, [userId]);
    const rows = await prisma.notification.findMany({ where: { type: BROADCAST, dedupeKey: { startsWith: `broadcast:${broadcast.id}:` } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dedupeKey).toBe(`broadcast:${broadcast.id}:${userId}`);
  });

  it("targets the owning chat, sends plain capped text, and classifies errors", async () => {
    const broadcast = await prisma.broadcast.create({ data: { id: "test-05-03-dispatch", authorTelegramId: TELEGRAM_ID, body: "x".repeat(5000), total: 1 } });
    await enqueueBroadcastNotifications(broadcast.id, [userId]);
    const row = await prisma.notification.findFirstOrThrow({ where: { dedupeKey: `broadcast:${broadcast.id}:${userId}` } });
    const sender = fakeSender();
    expect((await dispatchBroadcast(row.id, sender)).outcome).toBe("pushed");
    expect(String(sender.calls[0]?.chatId)).toBe(String(TELEGRAM_ID));
    expect(sender.calls[0]?.text?.length).toBe(BOT_REPLY_CAP);
    expect((await dispatchBroadcast(row.id, fakeSender({ error: "forbidden" }))).outcome).toBe("skipped");
    expect((await dispatchBroadcast(row.id, fakeSender({ error: "rate_limited" }))).outcome).toBe("retryable_error");
  });
});

describe("broadcast status", () => {
  it("follows the queued/sending/sent/failed derivation", () => {
    expect(deriveBroadcastStatus({ total: 2, sent: 0, failed: 0, pending: 2 })).toBe("queued");
    expect(deriveBroadcastStatus({ total: 2, sent: 1, failed: 0, pending: 1 })).toBe("sending");
    expect(deriveBroadcastStatus({ total: 2, sent: 2, failed: 0, pending: 0 })).toBe("sent");
    expect(deriveBroadcastStatus({ total: 2, sent: 1, failed: 1, pending: 0 })).toBe("failed");
  });

  it("loads pending and terminal counts from notification rows", async () => {
    const broadcast = await prisma.broadcast.create({ data: { id: "test-05-03-status", authorTelegramId: TELEGRAM_ID, body: "status", total: 1 } });
    await enqueueBroadcastNotifications(broadcast.id, [userId]);
    expect((await loadBroadcastStatus(broadcast.id)).status).toBe("queued");
  });
});
