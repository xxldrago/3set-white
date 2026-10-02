// Server-only QR renderer (D-30 / UI-SPEC "QR is a locally-rendered SVG").
//
// The subscription URL is credential-bearing and must never leave the server
// as a third-party image request: this module renders the QR locally as an SVG
// string that the page injects inline. There is NO `QRCode.toSvg()` in the
// `qrcode` package (RESEARCH Pitfall 3) — the export is `toString` with
// `{ type: "svg" }`. `qrcode`'s main entry is CommonJS; the default import
// resolves under `moduleResolution: "bundler"`.
import QRCode from "qrcode";

/**
 * Render `url` as a self-contained SVG QR code (never a remote image URL).
 * Server-only: never import this from a client component.
 */
export async function renderSubscriptionQr(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    // UI-SPEC: error correction M, quiet zone 4, 256px viewBox.
    errorCorrectionLevel: "M",
    margin: 4,
    width: 256,
  });
}
