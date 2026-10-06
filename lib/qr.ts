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

/**
 * Render `url` as a PNG `Buffer` for a Telegram photo (UI-SPEC §7 / 03-07).
 *
 * The bot pushes the subscription QR as a generated image, not a link/URL: the
 * subscription URL is credential-bearing, so it must never be sent as a remote
 * image request. `QRCode.toBuffer` is the PNG export (there is no `toSvg` —
 * see the module header); same geometry as the SVG path (M / margin 4 / 256px)
 * so the cabinet SVG and the bot photo encode identically.
 *
 * Server-only: never import this from a client component.
 */
export async function renderSubscriptionQrPng(url: string): Promise<Buffer> {
  // `qrcode` throws "No input text" on an empty payload. The bot push must not
  // throw on a degraded path, so an absent/blank URL encodes a non-credential
  // placeholder instead — the caller renders the keyed "link unavailable" copy
  // and never sends this placeholder as if it were a real sub-link.
  const payload = url.trim().length > 0 ? url : "about:blank";
  return QRCode.toBuffer(payload, {
    type: "png",
    // UI-SPEC: error correction M, quiet zone 4, 256px.
    errorCorrectionLevel: "M",
    margin: 4,
    width: 256,
  });
}
