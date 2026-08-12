import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { StatusChip } from "@/components/ui/StatusChip";
import { MISSION_STATE_CHIP } from "@/app/app/components/MissionSummaryCard";
import { DashboardFrame } from "../DashboardFrame";
import { DEMO_BUSINESS, DEMO_DASHBOARD } from "../fixtures/showcase-data";

export function DashboardDemo() {
  const { attention, inProgress, recentDone, metrics } = DEMO_DASHBOARD;
  return (
    <DashboardFrame activeNav="Command Center" title="Command Center">
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Command Center</h2>
          <p className="mt-0.5 text-[11px] text-sx-text-muted">
            {DEMO_BUSINESS.name} <span className="text-sx-text-subtle">·</span> what Stratxcel is doing for you
          </p>
        </header>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Active work" value={metrics.activeMissions} deltaLabel="in progress" />
          <Metric label="Open leads" value={metrics.openLeads} deltaLabel="in CRM" />
          <Metric label="Scheduled" value={metrics.scheduledPosts} deltaLabel="posts queued" />
        </div>
        <section>
          <h3 className="font-sx-sans text-[11px] font-semibold text-sx-text">Needs your attention</h3>
          <div className="mt-2 flex flex-col gap-1.5">
            {attention.map((item) => (
              <div key={item.label} className="rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 py-2">
                <p className="text-[11px] font-medium text-sx-text">{item.label}</p>
                <p className="mt-0.5 text-[10px] text-sx-text-subtle">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="font-sx-sans text-[11px] font-semibold text-sx-text">Work in progress</h3>
          <Card className="mt-2 !p-2.5">
            {inProgress.map((m) => {
              const chip = MISSION_STATE_CHIP[m.state];
              return (
                <CardRow key={m.goal}>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-sx-text-muted">{m.goal}</span>
                  <StatusChip state={chip.state} pulse={chip.state === "ai"}>{chip.label}</StatusChip>
                </CardRow>
              );
            })}
          </Card>
        </section>
        <section>
          <h3 className="font-sx-sans text-[11px] font-semibold text-sx-text">Recent outcomes</h3>
          <Card className="mt-2 !p-2.5">
            <CardHeading className="!text-[11px]">Finished recently</CardHeading>
            {recentDone.map((m) => {
              const chip = MISSION_STATE_CHIP[m.state];
              return (
                <CardRow key={m.goal}>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-sx-text-muted">{m.goal}</span>
                  <StatusChip state={chip.state}>{chip.label}</StatusChip>
                </CardRow>
              );
            })}
          </Card>
        </section>
      </div>
    </DashboardFrame>
  );
}
