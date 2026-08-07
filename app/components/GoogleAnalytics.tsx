import Script from "next/script";

/**
 * GA4 via gtag.js, mounted once in app/layout.tsx alongside <Analytics /> —
 * the two are independent products (Vercel Web Analytics vs. Google Analytics)
 * and do not double-count each other.
 *
 * Page views: exactly one source. `gtag('config', …)` fires the initial
 * page_view, and GA4's enhanced measurement ("Page changes based on browser
 * history events", on by default) covers App Router client navigation, which
 * goes through the History API. No route-change listener is added here — that
 * is precisely what would produce duplicate page_view hits, and it is why the
 * official `@next/third-parties/google` GoogleAnalytics component does not add
 * one either (node_modules/next/dist/docs/01-app/02-guides/third-party-libraries.md).
 *
 * No PII is sent: no user id, email, tenant, or query string is passed to
 * gtag, and the measurement ID is the only value interpolated into the inline
 * script. GA4 anonymises IPs server-side by default, so the legacy UA
 * `anonymize_ip` flag is deliberately absent — it is a no-op on GA4.
 *
 * Renders nothing at all when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset or
 * malformed, so Preview and local dev stay free of analytics traffic and a
 * misconfigured value can never break the page or inject script.
 */

/** GA4 measurement IDs are `G-` followed by an uppercase alphanumeric token. */
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

export function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

  if (!gaId || !MEASUREMENT_ID_PATTERN.test(gaId)) return null;

  return (
    <>
      <Script
        id="google-analytics-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
      />
      <Script
        id="google-analytics-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`,
        }}
      />
    </>
  );
}
