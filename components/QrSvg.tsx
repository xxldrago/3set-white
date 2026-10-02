// Server component that renders a locally generated QR SVG inline (D-30).
//
// Security contract (T-02-19): it accepts ONLY the trusted SVG string produced
// by `lib/qr.ts` (never a URL to fetch), so no third-party image request can
// ever be introduced. The SVG is inert markup; the parent hides this component
// and shows `t("key.linkUnavailable")` when `subscriptionUrl` is missing.
export default function QrSvg({ svg }: { svg: string }) {
  return (
    <div
      className="h-auto w-64 max-w-full [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
