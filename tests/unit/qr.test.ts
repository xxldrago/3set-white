// CAB-04 QR vectors: the subscription QR is rendered locally as an SVG string
// (never a third-party image request), the `qrcode` package exposes no `toSvg`
// renderer (RESEARCH Pitfall 3), and the output carries no external references.
// Pure vector style (session.test.ts) — no DB, no network.
import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { renderSubscriptionQr, renderSubscriptionQrPng } from "../../lib/qr";

// PNG signature: the 8-byte magic every PNG stream starts with.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

// Bot delivery (03-07 / UI-SPEC §7): the subscription QR is sent as a generated
// Telegram photo. The buffer is produced LOCALLY from the sub-link (never a
// remote image URL) so a credential-bearing URL never crosses to a third party.
describe("renderSubscriptionQrPng — server-rendered PNG QR (UI-SPEC §7)", () => {
  it("resolves to a Buffer starting with the PNG signature", async () => {
    const png = await renderSubscriptionQrPng("https://example.test/sub/abcdef");

    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(png.length).toBeGreaterThan(8);
  });

  it("returns distinct PNG buffers for distinct URLs (payload is encoded)", async () => {
    const a = await renderSubscriptionQrPng("https://example.test/sub/one");
    const b = await renderSubscriptionQrPng("https://example.test/sub/two");
    expect(a.equals(b)).toBe(false);
  });

  it("still returns a PNG buffer for an empty URL (never throws)", async () => {
    const png = await renderSubscriptionQrPng("");
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  });
});
