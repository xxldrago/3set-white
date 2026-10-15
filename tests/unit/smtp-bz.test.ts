// smtp.bz HTTP transport tracer: multipart contract, auth header, tag
// passthrough, and failure mapping. The API base + key come from env set in
// `vi.hoisted` (before lib/env snapshots process.env); global fetch is
// stubbed so no network is ever hit.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["SMTPBZ_API_KEY"] = "test-smtp-bz-key";
  process.env["SMTP_FROM"] = "noreply@example.test";
});

import { MailError, sendMail, sendResetMail } from "../../lib/mail";

interface Captured {
  url: string;
  auth: string | null;
  fields: Record<string, string>;
}

let captured: Captured | null = null;
let status = 200;
let failNetwork = false;

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers);
      const fields: Record<string, string> = {};
      const body = init?.body;
      if (body instanceof FormData) {
        for (const [key, value] of body.entries()) {
          fields[key] = typeof value === "string" ? value : "[file]";
        }
      }
      captured = { url, auth: headers.get("authorization"), fields };
      if (failNetwork) throw new Error("network_down");
      return new Response(JSON.stringify({ ok: true }), { status });
    }),
  );
}

describe("smtp.bz HTTP transport", () => {
  beforeAll(() => {
    installFetch();
  });
  afterEach(() => {
    captured = null;
    status = 200;
    failNetwork = false;
  });

  it("posts multipart to /smtp/send with the key and required fields", async () => {
    const result = await sendMail({
      to: "user@example.test",
      subject: "Hi",
      text: "line1\n\nline2",
      tag: "verify",
    });
    expect(result).toEqual({ sent: true });
    expect(captured?.url).toBe("https://api.smtp.bz/v1/smtp/send");
    expect(captured?.auth).toBe("test-smtp-bz-key");
    expect(captured?.fields).toMatchObject({
      from: "noreply@example.test",
      to: "user@example.test",
      subject: "Hi",
      tag: "verify",
      text: "line1\n\nline2",
    });
    expect(captured?.fields["html"]).toContain("line1");
    expect(captured?.fields["html"]).toContain("line2");
  });

  it("templates carry their stats tags", async () => {
    await sendResetMail("user@example.test", "tok");
    expect(captured?.fields["tag"]).toBe("reset");
    expect(captured?.fields["html"]).toContain("/reset/confirm?token=tok");
  });

  it("maps 401/400 and network failures to MailError (no detail leak)", async () => {
    status = 401;
    await expect(
      sendMail({ to: "a@example.test", subject: "s", text: "t" }),
    ).rejects.toBeInstanceOf(MailError);
    status = 400;
    await expect(
      sendMail({ to: "a@example.test", subject: "s", text: "t" }),
    ).rejects.toBeInstanceOf(MailError);
    status = 200;
    failNetwork = true;
    await expect(
      sendMail({ to: "a@example.test", subject: "s", text: "t" }),
    ).rejects.toBeInstanceOf(MailError);
  });
});
