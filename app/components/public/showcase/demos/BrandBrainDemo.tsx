import { Card, CardHeading } from "@/components/ui/Card";
import { DashboardFrame } from "../DashboardFrame";
import { DEMO_BRAND_BRAIN } from "../fixtures/showcase-data";

export function BrandBrainDemo() {
  const b = DEMO_BRAND_BRAIN;
  return (
    <DashboardFrame activeNav="Brand Brain" title="Brand Brain">
      <div className="flex flex-col gap-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Brand Brain</h2>
            <p className="mt-0.5 text-[10px] text-sx-text-muted">Version 3 · the context every mission is compiled against.</p>
          </div>
          <span className="shrink-0 rounded-sx-sm bg-sx-accent px-2 py-1 font-sx-sans text-[10px] font-medium text-sx-accent-on">Saved</span>
        </header>
        <Card className="!p-3">
          <CardHeading className="!text-[11px]">Business</CardHeading>
          <dl className="mt-2 grid gap-2 text-[10.5px] sm:grid-cols-2">
            <div><dt className="text-sx-text-subtle">Business name</dt><dd className="font-medium text-sx-text">{b.business_name}</dd></div>
            <div><dt className="text-sx-text-subtle">Industry</dt><dd className="text-sx-text">{b.industry}</dd></div>
            <div><dt className="text-sx-text-subtle">Website</dt><dd className="text-sx-text">{b.website_url}</dd></div>
            <div><dt className="text-sx-text-subtle">Location / market</dt><dd className="text-sx-text">{b.location}</dd></div>
          </dl>
        </Card>
        <Card className="!p-3">
          <CardHeading className="!text-[11px]">Positioning</CardHeading>
          <p className="mt-2 text-[10.5px] leading-relaxed text-sx-text-muted">{b.positioning}</p>
        </Card>
        <Card className="!p-3">
          <CardHeading className="!text-[11px]">Voice</CardHeading>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div><p className="text-[10px] text-sx-text-subtle">Tone of voice</p><p className="mt-0.5 text-[10.5px] text-sx-text">{b.tone_of_voice}</p></div>
            <div><p className="text-[10px] text-sx-text-subtle">Target audience</p><p className="mt-0.5 text-[10.5px] text-sx-text">{b.target_audience}</p></div>
          </div>
        </Card>
        <Card className="!p-3">
          <CardHeading className="!text-[11px]">Channels</CardHeading>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {b.channels.map((ch) => (
              <li key={ch} className="rounded-sx-pill border border-sx-border bg-sx-surface-2 px-2 py-0.5 font-sx-mono text-[9px] uppercase tracking-wide text-sx-text-muted">{ch}</li>
            ))}
          </ul>
        </Card>
      </div>
    </DashboardFrame>
  );
}
