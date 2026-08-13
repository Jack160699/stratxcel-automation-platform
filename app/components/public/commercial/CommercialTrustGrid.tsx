import Link from "next/link";
import { CUSTOMER_TRUST_CLAIMS } from "@/lib/commercial/trust-copy";
import { Card, CardHeading } from "@/components/ui/Card";
export function CommercialTrustGrid({ limit, offset = 0, className = "" }: { limit?: number; offset?: number; className?: string }) {
  const items = limit ? CUSTOMER_TRUST_CLAIMS.slice(offset).slice(0, limit) : CUSTOMER_TRUST_CLAIMS.slice(offset);
  return (<div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`.trim()}>{items.map((claim) => (<Card key={claim.id} variant="panel" className="p-5 sm:p-6"><CardHeading className="text-base uppercase tracking-wide">{claim.headline}</CardHeading><p className="mt-2 text-[13px] text-sx-text-muted">{claim.summary}</p>{claim.detail ? <p className="mt-2 text-[11px] text-sx-text-subtle">{claim.detail}</p> : null}</Card>))}</div>);
}
export function CommercialTrustSection() {
  return (<section className="border-t border-sx-border bg-sx-surface-1"><div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto max-w-2xl text-center"><p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Built for trust</p><h2 className="mt-3 text-2xl font-bold sm:text-3xl">Controls you can understand — and inspect</h2></div><div className="mt-10"><CommercialTrustGrid limit={6} /></div><div className="mt-6 text-center"><Link href="/security" className="text-sm font-semibold text-sx-accent hover:underline">Read the full security overview →</Link></div></div></section>);
}
