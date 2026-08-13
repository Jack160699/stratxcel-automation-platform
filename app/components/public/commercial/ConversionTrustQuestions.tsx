import Link from "next/link";
import { TRUST_QUESTIONS } from "@/lib/commercial/trust-copy";
export function ConversionTrustQuestions({ className = "", limit }: { className?: string; limit?: number }) {
  const items = limit ? TRUST_QUESTIONS.slice(0, limit) : TRUST_QUESTIONS;
  return (<section className={`border-t border-sx-border bg-sx-surface-2 ${className}`.trim()}><div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-2xl text-center"><p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Trust & control</p><h2 className="mt-3 text-2xl font-bold sm:text-3xl">Questions owners ask before they connect</h2></div><dl className="mt-10 grid gap-4 sm:grid-cols-2">{items.map((item) => (<div key={item.id} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-6"><dt className="text-sm font-bold">{item.question}</dt><dd className="mt-2 text-[13px] text-sx-text-muted">{item.answer}</dd>{item.learnMoreHref ? <p className="mt-3"><Link href={item.learnMoreHref} className="text-xs font-semibold text-sx-accent hover:underline">Learn more</Link></p> : null}</div>))}</dl></div></section>);
}
