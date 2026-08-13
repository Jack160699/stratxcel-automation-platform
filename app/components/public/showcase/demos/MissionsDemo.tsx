import { MissionSummaryCard } from "@/app/app/components/MissionSummaryCard";
import { Card, CardHeading } from "@/components/ui/Card";
import { DashboardFrame } from "../DashboardFrame";
import { DEMO_MISSIONS } from "../fixtures/showcase-data";

export function MissionsDemo() {
  return (
    <DashboardFrame title="Missions">
      <div className="flex flex-col gap-3">
        <header>
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Work requests</h2>
          <p className="mt-0.5 text-[10px] text-sx-text-muted">Give Stratxcel an outcome — missions compile, estimate, and route to the right capability.</p>
        </header>
        <Card variant="ai" className="!p-3">
          <CardHeading className="!text-[11px]">New mission</CardHeading>
          <p className="mt-2 rounded-sx-sm border border-sx-border bg-sx-bg/50 px-3 py-2 text-[10.5px] text-sx-text-muted">Plan and draft August Instagram content calendar aligned with Brand Brain</p>
          <p className="mt-2 font-sx-mono text-[9px] text-sx-text-subtle">Compiled against Brand Brain v3</p>
        </Card>
        <section>
          <h3 className="font-sx-sans text-[11px] font-semibold text-sx-text">Recent missions</h3>
          <div className="mt-2 flex flex-col gap-2">
            {DEMO_MISSIONS.map((mission) => <MissionSummaryCard key={mission.id} mission={mission} />)}
          </div>
        </section>
      </div>
    </DashboardFrame>
  );
}
