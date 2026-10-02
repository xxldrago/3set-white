// CAB-04 QR vectors: the subscription QR is rendered locally as an SVG string
// (never a third-party image request), the `qrcode` package exposes no `toSvg`
// renderer (RESEARCH Pitfall 3), and the output carries no external references.
// Pure vector style (session.test.ts) — no DB, no network.
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { renderSubscriptionQr } from "../../lib/qr";

describe("renderSubscriptionQr — server-rendered SVG QR (D-30)", () => {
  it("returns a string starting with <svg", async () => {
    const svg = await renderSubscriptionQr("https://example.test/sub/abcdef");
    expect(typeof svg).toBe("string");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
  });

  it("encodes the URL as the payload (distinct URLs differ)", async () => {
    const a = await renderSubscriptionQr("https://example.test/sub/one");
    const b = await renderSubscriptionQr("https://example.test/sub/two");
    expect(a).not.toBe(b);
  });

  it("exposes no toSvg renderer", () => {
    // Do NOT vi.spyOn(QRCode, "toSvg"): the export does not exist and the
    // spy call itself would throw.
    expect((QRCode as unknown as { toSvg?: unknown }).toSvg).toBeUndefined();
  });

  it("embeds no <image> and no external href", async () => {
    const svg = await renderSubscriptionQr("https://example.test/sub/xyz");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain('href="http');
    expect(svg).not.toContain("xlink:href");
  });
});
