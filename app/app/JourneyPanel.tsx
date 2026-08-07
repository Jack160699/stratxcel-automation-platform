import Link from "next/link";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import type { JourneyStage, StageStatus } from "@/lib/journey/progress";
import { ConsultationLink } from "./ConsultationLink";

const STATUS_CHIP: Record<StageStatus, ChipState> = {
  "Not started": "neutral",
  "In progress": "accent",
  Ready: "accent",
  "Needs attention": "warning",
  Complete: "success",
};

/**
 * Journey progress for the customer's own account, rendered from
 * deriveJourney()'s output only — this component holds no opinion about
 * whether a stage is done, so it cannot disagree with the persisted state.
 * Stacks to one column on phones; every action is a full-height tap target.
 */
export function JourneyPanel({
  stages,
  next,
  tenantId,
}: {
  stages: JourneyStage[];
  next: JourneyStage | null;
  tenantId: string;
}) {
  const complete = stages.filter((s) => s.status === "Complete").length;
  const linkClass = "font-sx-sans text-xs font-semibold text-sx-accent hover:underline disabled:opacity-50";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-sx-sans text-base font-medium text-sx-text">Your setup</h2>
        <p className="font-sx-mono text-xs text-sx-text-subtle">
          {complete} of {stages.length} complete
        </p>
      </div>

      {next?.action && (
        <Card variant="elevated" className="border border-sx-accent/40">
          <CardHeading>Next step</CardHeading>
          <p className="mt-1 text-sm text-sx-text-muted">{next.detail}</p>
          <Link
            href={next.action.href}
            className="mt-3 inline-flex min-h-11 items-center rounded-sx-sm bg-sx-accent px-5 font-sx-sans text-xs font-bold text-sx-accent-on hover:bg-[color:var(--sx-accent-hover)]"
          >
            {next.action.label} →
          </Link>
        </Card>
      )}

      <Card>
        <ol className="flex flex-col">
          {stages.map((stage, i) => (
            <li
              key={stage.key}
              className={`flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-3 ${
                i > 0 ? "border-t border-sx-border" : ""
              }`}
            >
              <span className="w-40 shrink-0 font-sx-sans text-[13px] font-medium text-sx-text">{stage.label}</span>
              <span className="min-w-0 flex-1 text-xs text-sx-text-muted">{stage.detail}</span>
              <span className="flex shrink-0 items-center gap-3">
                <StatusChip state={STATUS_CHIP[stage.status]}>{stage.status}</StatusChip>
                {stage.action &&
                  (stage.key === "consultation" ? (
                    <ConsultationLink
                      tenantId={tenantId}
                      href={stage.action.href}
                      label={stage.action.label}
                      className={linkClass}
                    />
                  ) : (
                    <Link href={stage.action.href} className={linkClass}>
                      {stage.action.label}
                    </Link>
                  ))}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
