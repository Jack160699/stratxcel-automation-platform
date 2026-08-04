import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About — Stratxcel",
  description: "Why Stratxcel exists and how to reach us.",
};

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">About</p>
          <h1 className="mt-4 font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            We think a business should have one place to get things done &mdash; not five.
          </h1>
          <p className="mt-6 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Most small and mid-sized businesses run on a patchwork of disconnected tools, agencies and spreadsheets &mdash; a
            different login for content, another for leads, another for the website, and no single place to see what&rsquo;s
            actually happening. Stratxcel exists to replace that patchwork with one workspace: you tell us what you need,
            we plan and execute it, and anything that matters waits for your say-so.
          </p>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            We&rsquo;re a small, working team &mdash; not a faceless platform. If you want to know who&rsquo;s behind a specific piece of
            work, ask us directly.
          </p>

          <div className="mt-12 border-t border-sx-border pt-8">
            <h2 className="font-sx-sans text-base font-semibold text-sx-text">Get in touch</h2>
            <p className="mt-2 font-sx-sans text-[13.5px] text-sx-text-muted">
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-sx-accent hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-block rounded-sx-sm bg-sx-accent px-5 py-2.5 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
            >
              Contact us
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
