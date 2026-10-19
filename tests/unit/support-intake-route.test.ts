// POST /api/support/intake — public landing support request.
//
// The route is the trust boundary for an anonymous writer that reaches two
// admin inboxes, so these vectors cover what actually matters: the per-channel
// contact validation (a visitor cannot claim telegram and pass a mail address),
// the honeypot drop, the throttle gate firing BEFORE any delivery, and the fact
// that a honeypot hit is indistinguishable from a success.
//
// prisma and both dispatch channels are mocked, so no DB and no network: the
// route's own contract is under test, not the providers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ loginAttempt: { upsert: vi.fn(), findFirst: vi.fn() } }));
vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

const notifyMock = vi.hoisted(() =>
  vi.fn<(payload: { channelLabel: string; contact: string; name: string; body: string }) => void>(),
);
vi.mock("../../lib/admin-notify", () => ({ notifyAdminsSupportIntake: notifyMock }));

const sendMailMock = vi.hoisted(() => vi.fn<(to: string, payload: unknown) => Promise<{ sent: boolean }>>());
vi.mock("../../lib/mail", () => ({ sendSupportIntakeMail: sendMailMock }));

// The real gate is exercised in auth-rate-limit.test.ts; here it is a seam that
// records which IP the route keys on and can be flipped into a denial.
type Gate = { allowed: boolean; retryAfterSec: number | null };
const OK_GATE: Gate = { allowed: true, retryAfterSec: null };
const rateMock = vi.hoisted(() => ({
  check: vi.fn<(ip: string) => Promise<Gate>>(),
  record: vi.fn<(ip: string) => Promise<Gate>>(),
}));
vi.mock("../../lib/auth-rate-limit", () => ({
  checkSupportRateLimit: rateMock.check,
  recordSupportAttempt: rateMock.record,
}));

import { POST } from "../../app/api/support/intake/route";
import { env } from "../../lib/env";

/** Build a Request that looks like it came through the nginx proxy. */
function req(body: unknown, ip = "203.0.113.7"): Request {
  return new Request("https://dash.3set.online/api/support/intake", {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

const valid = {
  channel: "telegram",
  contact: "@threeSet_bot",
  name: "Иван",
  message: "VPN отключается через 10 минут",
};

/** Let the fire-and-forget dispatch microtask settle. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  rateMock.check.mockResolvedValue(OK_GATE);
  rateMock.record.mockResolvedValue(OK_GATE);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/support/intake — happy paths", () => {
  it("accepts a telegram request and notifies admins on both channels", async () => {
    env.SUPPORT_ADMIN_EMAIL = "admin@3set.online";

    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Dispatch is fire-and-forget, so wait for the microtask before asserting.
    await settle();
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const payload = notifyMock.mock.calls[0]![0];
    expect(payload).toMatchObject({
      contact: "@threeSet_bot",
      name: "Иван",
      body: valid.message,
      channelLabel: "Telegram",
    });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0]![0]).toBe("admin@3set.online");
  });

  it("accepts an email request and lowercases the address", async () => {
    const res = await POST(
      req({ ...valid, channel: "email", contact: "Ivan@Example.COM" }),
    );
    expect(res.status).toBe(200);
    await settle();

    const payload = notifyMock.mock.calls[0]![0];
    expect(payload.contact).toBe("ivan@example.com");
    expect(payload.channelLabel).toBe("Email");
  });

  it("adds the @ to a bare telegram handle and tolerates an already-prefixed one", async () => {
    await POST(req({ ...valid, contact: "threeSet_bot" }));
    await settle();
    expect(notifyMock.mock.calls[0]![0].contact).toBe("@threeSet_bot");

    notifyMock.mockClear();
    await POST(req({ ...valid, contact: "@threeSet_bot" }));
    await settle();
    expect(notifyMock.mock.calls[0]![0].contact).toBe("@threeSet_bot");
  });

  it("keeps working when no admin inbox is configured (telegram-only delivery)", async () => {
    env.SUPPORT_ADMIN_EMAIL = undefined;

    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    await settle();

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/support/intake — validation", () => {
  it.each([
    ["rejects an email channel carrying a telegram handle", { ...valid, channel: "email", contact: "@threeSet_bot" }],
    ["rejects a telegram channel carrying an email", { ...valid, channel: "telegram", contact: "a@b.com" }],
    ["rejects an unknown channel", { ...valid, channel: "sms" }],
    ["rejects a non-email contact on the email channel", { ...valid, channel: "email", contact: "not-an-email" }],
    ["rejects a telegram handle with illegal characters", { ...valid, contact: "@bad name" }],
    ["rejects a too-short telegram handle", { ...valid, contact: "@abc" }],
    ["rejects an empty message", { ...valid, message: "   " }],
    ["rejects an over-long message", { ...valid, message: "x".repeat(4001) }],
    ["rejects a missing channel", { contact: "@threeSet_bot", message: "hi" }],
  ])("%s", async (_label, body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_request" });
    await settle();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON without throwing", async () => {
    const res = await POST(
      new Request("https://dash.3set.online/api/support/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/support/intake — abuse controls", () => {
  it("drops a honeypot submission silently, indistinguishable from success", async () => {
    const res = await POST(req({ ...valid, website: "http://spam.example" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await settle();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(rateMock.record).not.toHaveBeenCalled();
  });

  it("returns 429 and notifies nobody once the IP is throttled", async () => {
    rateMock.check.mockResolvedValue({ allowed: false, retryAfterSec: 900 });

    const res = await POST(req(valid));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited", retryAfterSec: 900 });
    await settle();
    expect(notifyMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
    // A blocked request must not even consume an attempt slot.
    expect(rateMock.record).not.toHaveBeenCalled();
  });

  it("keys the throttle on the trusted X-Real-IP, not the visitor's contact", async () => {
    await POST(req({ ...valid, contact: "@someone_else" }, "198.51.100.9"));
    expect(rateMock.check).toHaveBeenCalledWith("198.51.100.9");
    expect(rateMock.record).toHaveBeenCalledWith("198.51.100.9");
  });

  it("records an attempt even when the payload is valid but unconfigured downstream", async () => {
    await POST(req(valid));
    expect(rateMock.record).toHaveBeenCalledTimes(1);
  });
});