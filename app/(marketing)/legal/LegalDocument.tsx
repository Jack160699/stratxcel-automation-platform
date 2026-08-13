import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <header className="border-b border-sx-border pb-8">
        <p className="sx-public-kicker">{eyebrow}</p>
        <h1 className="sx-public-display mt-3 text-4xl sm:text-5xl">{title}</h1>
        <p className="sx-public-lead mt-4 max-w-2xl">{intro}</p>
        <p className="mt-4 text-xs text-sx-text-subtle">Last updated: July 28, 2026</p>
      </header>
      <div className="mt-10 space-y-8 text-[15px] leading-7 text-sx-text-muted">{children}</div>
      <div className="mt-12 rounded-sx-lg border border-sx-border bg-sx-surface-1 p-5 text-sm text-sx-text-muted">
        Questions or requests? Use the verified <Link href="/contact" className="font-semibold text-sx-accent hover:underline">Stratxcel contact form</Link>.
      </div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-sx-text">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
