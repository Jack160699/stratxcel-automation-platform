import Link from "next/link";
import { TRUST_CLAIMS } from "@/lib/commercial/catalog";
import { Card, CardHeading } from "@/components/ui/Card";

export function CommercialTrustGrid({ limit, offset = 0, className = "" }: { limit?: number; offset?: number; className?: string }) {
  const items = (limit ? TRUST_CLAIMS.slice(offset).slice(0, limit) : TRUST_CLAIMS.slice(offset));
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`.trim()}>
      {items.map((claim) => (
        <Card key={claim.id} variant="panel" className="p-5 sm:p-6">
          <CardHeading className="text-base">{claim.title}</CardHeading>
          <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{claim.body}</p>
        </Card>
      ))}
    </div>
  );
}

export function CommercialTrustSection() {
  return (
    <section className="border-t border-sx-border bg-sx-surface-1">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Commercial trust</p>
          <h2 className="mt-3 font-sx-sans text-2xl font-bold text-sx-text sm:text-3xl">Controls serious businesses can inspect</h2>
          <p className="mt-3 text-sm text-sx-text-muted">Genuine architecture — not fabricated certifications or vanity metrics.</p>
        </div>
        <div className="mt-10"><CommercialTrustGrid limit={6} /></div>
        <p className="mt-8 text-center text-xs text-sx-text-subtle">No SOC 2, ISO 27001, HIPAA, or PCI certification claims unless formally obtained.</p>
        <div className="mt-6 text-center">
          <Link href="/security" className="text-sm font-semibold text-sx-accent hover:underline">Read the full security overview →</Link>
        </div>
      </div>
    </section>
  );
}
