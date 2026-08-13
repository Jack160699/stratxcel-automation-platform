import type { ObjectionFaq } from "@/lib/commercial/objections";
export function ConversionFaqSection({ title = "Common questions", subtitle, items, className = "" }: { title?: string; subtitle?: string; items: ObjectionFaq[]; className?: string }) {
  return (<section className={className}><div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8"><div className="text-center"><h2 className="text-2xl font-bold">{title}</h2>{subtitle ? <p className="mt-2 text-sm text-sx-text-muted">{subtitle}</p> : null}</div><dl className="mt-10 space-y-4">{items.map((item) => (<div key={item.id} className="rounded-sx-md border border-sx-border bg-sx-bg p-6"><dt className="font-bold">{item.question}</dt><dd className="mt-2 text-sm text-sx-text-muted">{item.answer}</dd></div>))}</dl></div></section>);
}
