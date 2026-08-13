import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { CommercialTrustGrid } from "@/app/components/public/commercial/CommercialTrustGrid";
import { Card, CardHeading } from "@/components/ui/Card";
import { TRUST_CLAIMS } from "@/lib/commercial/catalog";

export const metadata: Metadata = {
  title: "Security & trust — Stratxcel",
  description: "How Stratxcel isolates client data and controls what runs without your approval.",
};

export default function SecurityPage() {
  const principles = TRUST_CLAIMS.slice(0, 4);
  return (
    <PublicPageShell>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Security &amp; trust</p>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold">Your data stays yours, and stays separated.</h1>
          <p className="mt-5 max-w-2xl text-[15px] text-sx-text-muted">Tenant isolation by design — not purchased certification badges.</p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {principles.map((p) => (
              <Card key={p.id} variant="panel">
                <CardHeading>{p.title}</CardHeading>
                <p className="mt-2 text-[13px] text-sx-text-muted">{p.body}</p>
              </Card>
            ))}
          </div>
        </section>
        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="text-xl font-semibold">Operational controls</h2>
            <div className="mt-8"><CommercialTrustGrid offset={4} limit={5} /></div>
          </div>
        </section>
        <section className="border-t border-sx-border">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="text-xl font-semibold">Data handling</h2>
            <p className="mt-3 text-[13.5px] text-sx-text-muted">No formal retention schedule or sub-processor list published yet. No SOC 2, ISO 27001, HIPAA, or PCI claims unless formally obtained.</p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
              <Link href="/privacy" className="text-sx-accent hover:underline">Privacy Policy</Link>
              <Link href="/data-deletion" className="text-sx-accent hover:underline">Data deletion</Link>
              <Link href="/integrations" className="text-sx-accent hover:underline">Integrations</Link>
            </div>
          </div>
        </section>
        <section className="py-16 text-center">
          <Link href="/contact?intent=security" className="rounded-sx-sm bg-sx-accent px-6 py-3 text-sm font-semibold text-sx-accent-on">Contact security team</Link>
        </section>
    </PublicPageShell>
  );
}
