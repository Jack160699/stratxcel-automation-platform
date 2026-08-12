import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { AuditFunnelCta } from "@/app/components/public/solutions";
import { getCustomerTypeBySlug, PUBLISHED_CUSTOMER_TYPES } from "@/lib/solutions/customer-types";
import { getOutcomeById } from "@/lib/solutions/outcomes";
type PageProps = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return PUBLISHED_CUSTOMER_TYPES.map((t) => ({ slug: t.slug })); }
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params; const s = getCustomerTypeBySlug(slug);
  return s ? { title: `${s.title} — Stratxcel Solutions`, description: s.description } : { title: "Solutions — Stratxcel" };
}
export default async function Page({ params }: PageProps) {
  const { slug } = await params; const solution = getCustomerTypeBySlug(slug);
  if (!solution) notFound();
  const outcomes = solution.outcomeIds.map(getOutcomeById).filter(Boolean);
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg"><PublicHeader /><main className="flex-1">
      <section className="mx-auto max-w-6xl px-4 py-14"><Link href="/solutions" className="text-sm text-sx-accent">← All solutions</Link><h1 className="mt-4 text-3xl font-semibold">{solution.headline}</h1><p className="mt-3 text-sx-text-muted">{solution.description}</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">{outcomes.map((o) => o && <li key={o.id} className="rounded-sx-md border border-sx-border p-4"><h3 className="font-semibold">{o.title}</h3><p className="text-sm text-sx-accent">{o.tagline}</p></li>)}</ul></section>
      <AuditFunnelCta /></main><PublicFooter /></div>
  );
}
