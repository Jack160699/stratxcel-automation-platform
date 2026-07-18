import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ScrollRestoration } from "@/app/components/ScrollRestoration";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://stratxcel.vercel.app"),
  title: "Stratxcel — the operating system for modern business",
  description:
    "Stratxcel engineers businesses: websites that build themselves, automation that connects everything, AI agents that think before they act. Press start.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/favicon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Stratxcel — the operating system for modern business",
    description:
      "An interactive journey through websites that build themselves, automation that connects everything, and AI agents that think before they act.",
    type: "website",
    images: [{ url: "/logo-v2.png", width: 641, height: 641 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#05070e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#05070e] text-slate-100">
        <ScrollRestoration />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
