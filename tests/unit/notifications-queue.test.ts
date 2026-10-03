// Notification queue vectors (SUP-03 / T-04-11 / T-04-12):
// - `enqueueNotification` is idempotent on the UNIQUE `dedupeKey` (a retried
//   reply route cannot mint a second delivery);
// - `claimNextNotification` is single-winner (two claims of one row → one win);
// - `rescheduleNotification` returns the row to `pending` with a future retry
//   and an incremented attempt count (no delivery lost on a Bot API blip);
// - a sender-less `drainOutbox()` never consumes a notification (stays pending).
// Runs against the real local Postgres, mirroring outbox-worker.test.ts cleanup.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  NOTIFY_TICKET_REPLY,
  claimNextNotification,
  enqueueNotification,
  markNotificationDone,
  markNotificationFailed,
  rescheduleNotification,
} from "../../lib/outbox";
import { prisma } from "../../lib/prisma";
import { drainOutbox } from "../../lib/worker";

const PREFIX = "test-04-03q:";

function key(suffix: string): string {
  return `${PREFIX}${suffix}`;
}

async function cleanup(): Promise<void> {
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await cleanup();
});

describe("enqueueNotification — idempotent dedupe (T-04-11)", () => {
  it("creates exactly one row for two enqueues with the same dedupeKey", async () => {
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("dup"), ticketId: "t1" });
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("dup"), ticketId: "t1" });

    expect(await prisma.notification.count({ where: { dedupeKey: key("dup") } })).toBe(1);
  });

  it("allows distinct dedupeKeys to coexist", async () => {
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("a") });
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("b") });

    expect(
      await prisma.notification.count({ where: { dedupeKey: { startsWith: PREFIX } } }),
    ).toBe(2);
  });
});

describe("claimNextNotification — single-winner (T-04-11)", () => {
  it("returns the row once and null on a second claim while it is processing", async () => {
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("claim"), ticketId: "t1" });

    const first = await claimNextNotification(NOTIFY_TICKET_REPLY);
    expect(first).not.toBeNull();
    expect(first?.dedupeKey).toBe(key("claim"));

    const second = await claimNextNotification(NOTIFY_TICKET_REPLY);
    expect(second).toBeNull();

    const row = await prisma.notification.findUnique({ where: { dedupeKey: key("claim") } });
    expect(row?.status).toBe("processing");
  });

  it("only claims rows of the requested type", async () => {
    await enqueueNotification({ type: "other-type", dedupeKey: key("other") });

    const claimed = await claimNextNotification(NOTIFY_TICKET_REPLY);
    expect(claimed).toBeNull();

    await prisma.notification.deleteMany({ where: { dedupeKey: key("other") } });
  });
});

describe("rescheduleNotification / state writers (T-04-12)", () => {
  it("returns a claimed row to pending with a future retry and attempts +1", async () => {
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("retry") });
    const claimed = await claimNextNotification(NOTIFY_TICKET_REPLY);
    if (!claimed) throw new Error("expected a claimed notification");

    const nextAttemptAt = new Date(Date.now() + 60_000);
    await rescheduleNotification(claimed.id, nextAttemptAt, "telegram");

    const row = await prisma.notification.findUnique({ where: { id: claimed.id } });
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("telegram");
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 59_000);
  });

  it("terminal-success and terminal-failure writers set the expected status", async () => {
    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("done") });
    const done = await claimNextNotification(NOTIFY_TICKET_REPLY);
    if (!done) throw new Error("expected a claimed notification");
    await markNotificationDone(done.id);
    expect((await prisma.notification.findUnique({ where: { id: done.id } }))?.status).toBe("done");

    await enqueueNotification({ type: NOTIFY_TICKET_REPLY, dedupeKey: key("failed") });
    const failed = await claimNextNotification(NOTIFY_TICKET_REPLY);
    if (!failed) throw new Error("expected a claimed notification");
    await markNotificationFailed(failed.id, "unexpected");
    expect((await prisma.notification.findUnique({ where: { id: failed.id } }))?.status).toBe(
      "failed",
    );
  });
});

describe("sender-less drain (T-04-12)", () => {
  it("leaves a pending ticket-reply notification pending when no sender is supplied", async () => {
    await enqueueNotification({
      type: NOTIFY_TICKET_REPLY,
      dedupeKey: key("pending"),
      ticketId: "t1",
      ticketMessageId: "m1",
    });

    await drainOutbox();

    const row = await prisma.notification.findUnique({ where: { dedupeKey: key("pending") } });
    expect(row?.status).toBe("pending");
    expect(row?.attempts).toBe(0);
  });
});
