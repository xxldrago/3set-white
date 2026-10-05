import {
  BOT_REPLY_CAP,
  type NotifyDispatchResult,
  type TelegramSender,
} from "./bot-payments";
import { prisma } from "./prisma";

export type BroadcastCounts = { total: number; sent: number; failed: number; pending: number };
export type BroadcastDerivedStatus = "queued" | "sending" | "sent" | "failed";

export function deriveBroadcastStatus(counts: BroadcastCounts): BroadcastDerivedStatus {
  const processed = counts.sent + counts.failed;
  if (processed === 0) return "queued";
  if (counts.pending > 0) return "sending";
  return counts.failed > 0 ? "failed" : "sent";
}

function broadcastIdFromDedupeKey(dedupeKey: string): string | null {
  const match = /^broadcast:([^:]+):\d+$/.exec(dedupeKey);
  return match?.[1] ?? null;
}

export async function recordBroadcastOutcome(
  notificationId: string,
  outcome: "pushed" | "skipped",
): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { dedupeKey: true },
  });
  const id = notification && broadcastIdFromDedupeKey(notification.dedupeKey);
  if (!id) return;
  const field = outcome === "pushed" ? "sent" : "failed";
  await prisma.broadcast.updateMany({
    where: { id, status: { in: ["queued", "sending"] } },
    data: { [field]: { increment: 1 }, status: "sending" },
  });
  const current = await prisma.broadcast.findUnique({
    where: { id },
    select: { total: true, sent: true, failed: true },
  });
  if (current && current.sent + current.failed >= current.total) {
    await prisma.broadcast.updateMany({
      where: { id, status: "sending" },
      data: {
        status: current.failed > 0 ? "failed" : "sent",
        finishedAt: new Date(),
      },
    });
  }
}

function errorCode(error: unknown): number | undefined {
  const value = error as { response?: { error_code?: unknown }; error_code?: unknown };
  const code = value?.response?.error_code ?? value?.error_code;
  return typeof code === "number" ? code : undefined;
}

export async function dispatchBroadcast(
  notificationId: string,
  send: TelegramSender,
): Promise<NotifyDispatchResult> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userId: true, dedupeKey: true },
  });
  const broadcastId = notification && broadcastIdFromDedupeKey(notification.dedupeKey);
  if (!notification?.userId || !broadcastId) return { outcome: "skipped" };

  const [owner, broadcast] = await Promise.all([
    prisma.user.findUnique({
      where: { id: notification.userId },
      select: { chatId: true, telegramId: true },
    }),
    prisma.broadcast.findUnique({ where: { id: broadcastId }, select: { body: true } }),
  ]);
  if (!owner || !broadcast) return { outcome: "skipped" };

  const chatId = String(owner.chatId ?? owner.telegramId);
  try {
    await send.sendMessage(chatId, broadcast.body.slice(0, BOT_REPLY_CAP));
    return { outcome: "pushed" };
  } catch (error) {
    const code = errorCode(error);
    return code === 400 || code === 403
      ? { outcome: "skipped" }
      : { outcome: "retryable_error" };
  }
}

export async function loadBroadcastStatus(broadcastId: string): Promise<BroadcastCounts & { status: BroadcastDerivedStatus }> {
  const rows = await prisma.notification.groupBy({
    by: ["status"],
    where: { type: "broadcast", dedupeKey: { startsWith: `broadcast:${broadcastId}:` } },
    _count: { _all: true },
  });
  const counts: BroadcastCounts = { total: 0, sent: 0, failed: 0, pending: 0 };
  for (const row of rows) {
    const count = row._count._all;
    counts.total += count;
    if (row.status === "done") counts.sent += count;
    else if (row.status === "failed") counts.failed += count;
    else counts.pending += count;
  }
  return { ...counts, status: deriveBroadcastStatus(counts) };
}
