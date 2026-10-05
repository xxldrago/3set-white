// CR-02 regression: the shared client-IP resolver must never trust the
// client-controlled first `X-Forwarded-For` entry. `X-Real-IP` (edge-set)
// wins; without it the LAST XFF hop is used; no headers → "direct".
import { describe, expect, it } from "vitest";
import { clientIp } from "../../lib/client-ip";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/email/login", {
    method: "POST",
    headers,
  });
}

describe("clientIp (trusted hop resolver)", () => {
  it("returns x-real-ip when present, even with a spoofed multi-entry XFF", () => {
    expect(
      clientIp(
        req({
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "1.2.3.4, 203.0.113.7",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to the LAST XFF hop, never the first, when x-real-ip is absent", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("returns the single XFF entry when only one is present", () => {
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.42" }))).toBe("198.51.100.42");
  });

  it("returns \"direct\" when no forwarded headers are present", () => {
    expect(clientIp(req({}))).toBe("direct");
  });

  it("trims whitespace around every entry", () => {
    expect(clientIp(req({ "x-forwarded-for": "  1.2.3.4 ,   9.9.9.9  " }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-real-ip": "  203.0.113.9  " }))).toBe("203.0.113.9");
  });

  it("ignores empty x-real-ip and empty XFF entries", () => {
    expect(clientIp(req({ "x-real-ip": "  ", "x-forwarded-for": ", 9.9.9.9, " }))).toBe(
      "9.9.9.9",
    );
    expect(clientIp(req({ "x-forwarded-for": "  " }))).toBe("direct");
  });
});
