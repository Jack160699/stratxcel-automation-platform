import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";
import { AuditFunnelCta, BusinessJourneyVisual } from "@/app/components/public/solutions";
import { getOutcomeById } from "@/lib/solutions/outcomes";
import { getPublishedSolutionSlugs, getSolutionPageRecord } from "@/lib/solutions/solution-pages";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getPublishedSolutionSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const record = getSolutionPageRecord(slug);
  if (!record) return { title: "Solutions — Stratxcel" };
  const title = record.kind === "local-business-vertical" ? record.data.title : record.data.title;
  const description = record.data.description;
  return { title: `${title} — Stratxcel Solutions`, description };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const record = getSolutionPageRecord(slug);
  if (!record) notFound();

  if (record.kind === "local-business-vertical") {
    const vertical = record.data;
    return (
      <PublicPageShell>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <Link href="/solutions#built-around-your-business" className="text-sm text-sx-accent">
            ← All local business journeys
          </Link>
          <p className="mt-4 font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
            {vertical.title}
          </p>
          <h1 className="mt-2 font-sx-sans text-3xl font-semibold tracking-tight text-sx-text">{vertical.headline}</h1>
          <p className="mt-3 text-sx-text-muted">{vertical.description}</p>
          <BusinessJourneyVisual steps={vertical.journeySteps} className="mt-10" />
        </section>
        <AuditFunnelCta />
      </PublicPageShell>
    );
  }

  const solution = record.data;
  const outcomes = solution.outcomeIds.map(getOutcomeById).filter(Boolean);

  return (
    <PublicPageShell>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <Link href="/solutions" className="text-sm text-sx-accent">
          ← All solutions
        </Link>
        <h1 className="mt-4 font-sx-sans text-3xl font-semibold tracking-tight text-sx-text">{solution.headline}</h1>
        <p className="mt-3 text-sx-text-muted">{solution.description}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {outcomes.map(
            (o) =>
              o && (
                <li key={o.id} className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
                  <h3 className="font-semibold">{o.title}</h3>
                  <p className="text-sm text-sx-accent">{o.tagline}</p>
                </li>
              ),
          )}
        </ul>
      </section>
      <AuditFunnelCta />
    </PublicPageShell>
  );
}
