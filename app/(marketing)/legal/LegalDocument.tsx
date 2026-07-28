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
        <p className="mt-4 text-xs text-slate-500">Last updated: July 28, 2026</p>
      </header>
      <div className="prose prose-slate mt-10 max-w-none space-y-8 text-[15px] leading-7 text-slate-700">{children}</div>
      <div className="mt-12 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Questions or requests? Use the verified <Link href="/contact" className="font-semibold text-blue-700 hover:underline">Stratxcel contact form</Link>.
      </div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
