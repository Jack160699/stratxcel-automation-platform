import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
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
      <div className="flex min-h-screen flex-col bg-sx-bg">
        <PublicHeader />
        <main className="flex-1">
          <section className="mx-auto max-w-6xl px-4 py-14">
            <Link href="/solutions#built-around-your-business" className="text-sm text-sx-accent">
              ← All local business journeys
            </Link>
            <p className="mt-4 font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              {vertical.title}
            </p>
            <h1 className="mt-2 text-3xl font-semibold">{vertical.headline}</h1>
            <p className="mt-3 text-sx-text-muted">{vertical.description}</p>
            <BusinessJourneyVisual steps={vertical.journeySteps} className="mt-10" />
          </section>
          <AuditFunnelCta />
        </main>
        <PublicFooter />
      </div>
    );
  }

  const solution = record.data;
  const outcomes = solution.outcomeIds.map(getOutcomeById).filter(Boolean);

  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-14">
          <Link href="/solutions" className="text-sm text-sx-accent">
            ← All solutions
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">{solution.headline}</h1>
          <p className="mt-3 text-sx-text-muted">{solution.description}</p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {outcomes.map(
              (o) =>
                o && (
                  <li key={o.id} className="rounded-sx-md border border-sx-border p-4">
                    <h3 className="font-semibold">{o.title}</h3>
                    <p className="text-sm text-sx-accent">{o.tagline}</p>
                  </li>
                ),
            )}
          </ul>
        </section>
        <AuditFunnelCta />
      </main>
      <PublicFooter />
    </div>
  );
}
