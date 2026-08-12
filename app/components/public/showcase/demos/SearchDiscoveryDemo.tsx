import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip } from "@/components/ui/StatusChip";
import { DashboardFrame } from "../DashboardFrame";
import { DEMO_SEARCH } from "../fixtures/showcase-data";

export function SearchDiscoveryDemo() {
  const { propertyUrl, lastAnalysis, opportunities } = DEMO_SEARCH;
  const tabs = ["Overview", "Opportunities", "Google Search", "Local / Maps"] as const;
  return (
    <DashboardFrame title="Search & Discovery">
      <div className="flex flex-col gap-3">
        <header>
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Search & Discovery</h2>
          <p className="mt-0.5 text-[10px] text-sx-text-muted">Saved analysis history and prioritized discovery work.</p>
        </header>
        <Card className="!p-2.5">
          <CardHeading className="!text-[11px]">Website to analyse</CardHeading>
          <p className="mt-1 truncate font-sx-mono text-[10px] text-sx-text">{propertyUrl}</p>
        </Card>
        <nav className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="Search sections (preview)">
          {tabs.map((tab, i) => (
            <span key={tab} className={`shrink-0 rounded-sx-sm border px-2 py-1 font-sx-sans text-[9.5px] ${i === 1 ? "border-sx-accent bg-sx-accent-muted text-sx-text" : "border-sx-border text-sx-text-muted"}`}>{tab}</span>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Last analysis" value={lastAnalysis} deltaLabel="completed" />
          <Metric label="Active opportunities" value={opportunities.length} deltaLabel="saved findings" />
          <Metric label="Resolved" value={1} deltaLabel="preserved history" />
          <Metric label="Needs approval" value={0} deltaLabel="current actions" />
        </div>
        <Card className="!p-2.5">
          <div className="flex items-center justify-between">
            <CardHeading className="!text-[11px]">Current opportunities</CardHeading>
            <StatusChip state="accent">Needs attention</StatusChip>
          </div>
          {opportunities.map((o) => (
            <CardRow key={o.action}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-medium text-sx-text">{o.category}</p>
                <p className="truncate text-[10px] text-sx-text-subtle">{o.action}</p>
              </div>
              <StatusChip state={o.severity === "High" ? "warning" : o.severity === "Medium" ? "accent" : "neutral"}>{o.severity}</StatusChip>
            </CardRow>
          ))}
        </Card>
        <p className="text-[9px] leading-relaxed text-sx-text-subtle">Search recommendations are opportunities, not guarantees of rankings or traffic.</p>
      </div>
    </DashboardFrame>
  );
}
