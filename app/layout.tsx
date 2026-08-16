import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@/app/components/GoogleAnalytics";
import { ScrollRestoration } from "@/app/components/ScrollRestoration";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

/**
 * Stratxcel Core design system typefaces (docs/product-design/DESIGN_TOKEN_IMPLEMENTATION_MAP.md
 * §7) — loaded alongside Geist rather than replacing it, so existing pages
 * (marketing "journey" experience, Social Autopilot) keep rendering exactly
 * as before. New Core shell/shared components opt in via the font-sx-sans /
 * font-sx-mono Tailwind utilities (app/globals.css's @theme inline block).
 */
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.stratxcel.in"),
  alternates: {
    canonical: "https://www.stratxcel.in",
  },
  title: "Stratxcel — practical growth operations for small businesses",
  description:
    "Start with an evidence-backed AI Business Growth Audit, then activate the growth workflows that fit your business.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/favicon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Stratxcel — practical growth operations for small businesses",
    description:
      "Start with an evidence-backed AI Business Growth Audit, then activate the growth workflows that fit your business.",
    type: "website",
    url: "https://www.stratxcel.in",
    siteName: "Stratxcel",
    images: [{ url: "/logo-v2.png", width: 641, height: 641, alt: "Stratxcel Logo" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@stratxcel",
    title: "Stratxcel — practical growth operations for small businesses",
    description: "Start with an evidence-backed AI Business Growth Audit, then activate the growth workflows that fit your business.",
  },
  // Google Search Console HTML-tag ownership verification.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#fafbfc",
  width: "device-width",
  initialScale: 1,
};

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Stratxcel",
  url: "https://www.stratxcel.in",
  logo: "https://www.stratxcel.in/logo-v2.png",
  description:
    "Stratxcel runs end-to-end growth operations for small and local businesses, providing AI audits, social autopilot, WhatsApp reception, and CRM.",
  email: "contact@stratxcel.in",
  telephone: "+91-77778-12777",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Bhilai",
    addressRegion: "Chhattisgarh",
    addressCountry: "IN",
  },
  sameAs: [
    "https://www.instagram.com/stratxcel.ai/",
    "https://www.threads.net/@stratxcel.ai",
    "https://www.facebook.com/share/1ZfjUR2RTS/",
    "https://www.youtube.com/@StratxcelSolutions",
    "https://www.linkedin.com/company/107894380/",
    "https://wa.me/917777812777",
  ],
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Stratxcel",
  url: "https://www.stratxcel.in",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://www.stratxcel.in/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSans.variable} h-full antialiased sx-theme-light`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
        />
      </head>
      <body className="min-h-full bg-sx-bg text-sx-text">
        <Script
          id="sx-theme-boot"
          strategy="beforeInteractive"
        >{`(function(){try{var t=localStorage.getItem("sx-theme");if(t==="dark"){document.documentElement.classList.remove("sx-theme-light");document.documentElement.classList.add("sx-theme-dark");}}catch(e){}})();`}</Script>
        <ThemeProvider>
          <ScrollRestoration />
          {children}
          <Analytics />
          <GoogleAnalytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
