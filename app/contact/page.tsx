import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { ContactForm } from "@/app/components/ContactForm";
import { Card } from "@/components/ui/Card";
import { CONTACT_EMAIL, whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact — Stratxcel",
  description: "Tell us what you want to build. Websites, automation, AI agents, brands, apps — engineered as one system.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Contact</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            Engineer your business.
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Tell us what you want to build. We reply within one business day.
          </p>

          <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <Card variant="panel" className="max-w-xl p-6 sm:p-8">
              <ContactForm source="contact-page" tone="dark" intent={intent} />
            </Card>
            <aside className="space-y-6 font-sx-sans text-sm text-sx-text-muted">
              <div>
                <h2 className="font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sx-text-subtle">
                  Direct channels
                </h2>
                <p className="mt-3">
                  <a className="font-medium text-sx-accent hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                    {CONTACT_EMAIL}
                  </a>
                </p>
                <p className="mt-1.5">
                  <a className="font-medium text-sx-accent hover:underline" href={whatsappHref} target="_blank" rel="noreferrer">
                    WhatsApp — fastest reply
                  </a>
                </p>
              </div>
              <div>
                <h2 className="font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-sx-text-subtle">
                  What happens next
                </h2>
                <ol className="mt-3 list-decimal space-y-1.5 pl-4">
                  <li>We map your current stack and where it leaks.</li>
                  <li>You get a build plan with staged pricing.</li>
                  <li>We ship the first working system inside two weeks.</li>
                </ol>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
