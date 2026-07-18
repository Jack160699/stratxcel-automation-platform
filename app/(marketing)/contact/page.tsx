import type { Metadata } from "next";
import { PageHero } from "@/app/components/PageHero";
import { ContactForm } from "@/app/components/ContactForm";
import { CONTACT_EMAIL, whatsappHref } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact — Stratxcel",
  description:
    "Tell us what you want to build. Websites, automation, AI agents, brands, apps — engineered as one system.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Engineer your business."
        description="Tell us what you want to build. We reply within one business day."
      />
      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <ContactForm source="contact-page" tone="light" />
          </div>
          <aside className="space-y-5 text-sm text-slate-600">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Direct channels
              </h2>
              <p className="mt-3">
                <a className="font-medium text-blue-700 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p className="mt-1.5">
                <a
                  className="font-medium text-blue-700 hover:underline"
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp — fastest reply
                </a>
              </p>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
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
    </>
  );
}
