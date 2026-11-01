// tests/unit/client-ip.test.ts
import { describe, expect, it } from "vitest";
import { clientIp, hashClientIp, hashIp } from "../../lib/client-ip";

function makeReq(headers: Record<string, string>): Request {
  return new Request("http://test", { headers });
}

describe("clientIp() - resolution order", () => {
  it("X-Real-IP takes precedence when non-empty", () => {
    const req = makeReq({
      "x-real-ip": "1.2.3.4",
      "x-forwarded-for": "5.6.7.8, 9.10.11.12",
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("last X-Forwarded-For entry when X-Real-IP absent", () => {
    const req = makeReq({
      "x-forwarded-for": "attacker, 1.2.3.4",
    });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("direct fallback when no headers", () => {
    const req = makeReq({});
    expect(clientIp(req)).toBe("direct");
  });

  it("direct fallback when XFF empty", () => {
    const req = makeReq({ "x-forwarded-for": "" });
    expect(clientIp(req)).toBe("direct");
  });
});

describe("hashClientIp() - direct exclusion", () => {
  it("hashClientIp returns null for direct", () => {
    const req = makeReq({});
    expect(hashClientIp(req)).toBeNull();
  });

  it("hashClientIp returns sha256 hex for real IP", () => {
    const req = makeReq({ "x-real-ip": "1.2.3.4" });
    const hash = hashClientIp(req);
    expect(hash).toBeTruthy();
    expect(hash?.length).toBe(64);
  });
});

describe("hashIp() - never hash direct", () => {
  it("hashIp('direct') returns null", () => {
    expect(hashIp("direct")).toBeNull();
  });

  it("hashIp('1.2.3.4') returns sha256 hex", () => {
    const hash = hashIp("1.2.3.4");
    expect(hash).toBeTruthy();
    expect(hash?.length).toBe(64);
  });
});
