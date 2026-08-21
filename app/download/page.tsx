import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Android App — Stratxcel",
  description: "The Stratxcel Android app is in development. Use the full product today on mobile web or WhatsApp.",
};

const WHATSAPP_NOTIFY_HREF =
  "https://wa.me/917777812777?text=Hi%2C%20please%20let%20me%20know%20when%20the%20Stratxcel%20Android%20app%20is%20available.";

export default function DownloadPage() {
  return (
    <PublicPageShell>
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <p className="font-sx-mono text-xs font-bold uppercase tracking-[0.2em] text-sx-accent">
          Android App
        </p>
        <h1 className="mt-4 font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text sm:text-5xl">
          Not on the Play Store yet — and we won&apos;t pretend otherwise.
        </h1>
        <p className="mt-5 text-base text-sx-text-muted sm:text-lg">
          A dedicated Stratxcel Android app is in development. Until it&apos;s live, every capability of
          Stratxcel already works on your phone through the mobile web app and WhatsApp — nothing is
          held back waiting for the app.
        </p>

        <div className="mt-10 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 text-left shadow-[var(--sx-public-shadow-md)] sm:p-8">
          <h2 className="font-sx-sans text-lg font-bold text-sx-text">Use Stratxcel today</h2>
          <p className="mt-2 text-sm text-sx-text-muted">
            No install needed. Open Stratxcel in your phone&apos;s browser and add it to your home
            screen for an app-like experience, or manage your business straight from WhatsApp.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <TrackedCtaLink
              href="/audit"
              event="audit_cta_click"
              surface="download_page_audit"
              plan="audit"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-accent px-6 py-3 text-sm font-bold text-sx-accent-on"
            >
              Start Free Audit
            </TrackedCtaLink>
            <TrackedCtaLink
              href={PUBLIC_CTAS.primary.href}
              event={PUBLIC_CTAS.primary.event}
              surface="download_page_signup"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-6 py-3 text-sm font-semibold text-sx-text"
            >
              {PUBLIC_CTAS.primary.label}
            </TrackedCtaLink>
            <a
              href="https://wa.me/917777812777"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-6 py-3 text-sm font-semibold text-sx-text"
            >
              Open WhatsApp
            </a>
          </div>
        </div>

        <div className="mt-8 rounded-sx-lg border border-sx-border bg-sx-bg p-6 text-left sm:p-8">
          <h2 className="font-sx-sans text-lg font-bold text-sx-text">Want to know when it ships?</h2>
          <p className="mt-2 text-sm text-sx-text-muted">
            Message us on WhatsApp or email us and we&apos;ll let you know the moment the Android app is
            available for download — no account required to ask.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <a
              href={WHATSAPP_NOTIFY_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm bg-sx-surface-2 px-5 py-2.5 text-sm font-semibold text-sx-text hover:bg-sx-surface-3"
            >
              Notify me on WhatsApp
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Notify%20me%20-%20Stratxcel%20Android%20app`}
              className="inline-flex min-h-11 items-center justify-center rounded-sx-sm border border-sx-border-strong px-5 py-2.5 text-sm font-semibold text-sx-text"
            >
              Email {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        <p className="mt-8 text-xs text-sx-text-subtle">
          We&apos;ll only link a real Play Store listing here once the app is actually published — never a
          placeholder.
        </p>
      </section>
    </PublicPageShell>
  );
}
