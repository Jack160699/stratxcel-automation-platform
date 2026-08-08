import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <header className="border-b border-slate-200 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">{intro}</p>
        <p className="mt-4 text-xs text-slate-500">Effective and last updated: August 9, 2026</p>
      </header>
      <aside className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <strong>Pre-launch legal draft.</strong> This policy is prepared for publication but requires final review by qualified Indian counsel. Company address, registration details, tax identifiers, and any dedicated grievance or legal email must be added only after verification.
      </aside>
      <div className="prose prose-slate mt-10 max-w-none space-y-8 text-[15px] leading-7 text-slate-700">{children}</div>
      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Questions, complaints, or rights requests? Use the verified <Link href="/contact" className="font-semibold text-blue-700 hover:underline">Stratxcel contact form</Link>. Do not send passwords, payment-card details, API keys, or access tokens.
      </div>
    </article>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
