import type { ReactNode } from "react";
import { DEMO_BUSINESS } from "@/app/components/public/showcase/fixtures/showcase-data";
import type { HeroSceneKey } from "./hero-phrases";

export type WorkspaceAreaKey = Exclude<HeroSceneKey, "unified">;

export type WorkspaceArea = {
  key: WorkspaceAreaKey;
  /** Plain-language name of the workspace area, shown in the panel title bar. */
  label: string;
  /** Neutral product state — never an outcome, result, or metric. */
  state: string;
  body: ReactNode;
};

function Line({ w, tone = "muted" }: { w: string; tone?: "muted" | "faint" | "bright" }) {
  const bg = tone === "bright" ? "bg-white/45" : tone === "muted" ? "bg-white/24" : "bg-white/12";
  return <span className={`block h-[5px] rounded-full ${bg}`} style={{ width: w }} />;
}

function Row({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-[6px] border px-2 py-1.5 ${
        active ? "border-sx-accent/40 bg-sx-accent/[0.12]" : "border-white/8 bg-white/[0.03]"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The eight areas of one Stratxcel workspace, laid out left to right in the
 * order the hero headline walks through them. Content is deliberately neutral
 * product state — no results, percentages, rankings, or revenue claims.
 */
export const WORKSPACE_AREAS: WorkspaceArea[] = [
  {
    key: "search",
    label: "Search & discovery",
    state: "Opportunity found",
    body: (
      <div className="space-y-1.5">
        <Row>
          <span className="text-[10px] text-white/35">⌕</span>
          <span className="truncate font-sx-sans text-[10.5px] text-white/70">
            coffee near {DEMO_BUSINESS.location.split(",")[0]}
          </span>
        </Row>
        <Row active>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" />
          <span className="font-sx-sans text-[10.5px] text-white/80">Business profile</span>
        </Row>
        <Row>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
          <span className="font-sx-sans text-[10.5px] text-white/55">Menu page</span>
        </Row>
      </div>
    ),
  },
  {
    key: "social",
    label: "Social calendar",
    state: "Approval required",
    body: (
      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1">
          {["M", "T", "W", "T", "F"].map((d, i) => (
            <div
              key={`${d}-${i}`}
              className={`rounded-[5px] border px-0 py-1 text-center font-sx-mono text-[8px] ${
                i === 1 || i === 3
                  ? "border-sx-accent/40 bg-sx-accent/[0.14] text-sx-accent"
                  : "border-white/8 bg-white/[0.03] text-white/30"
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          <div className="h-9 w-9 shrink-0 rounded-[5px] bg-white/[0.07]" />
          <div className="flex flex-1 flex-col justify-center gap-1.5">
            <Line w="88%" />
            <Line w="56%" tone="faint" />
          </div>
        </div>
      </div>
    ),
  },
  {
    key: "content",
    label: "Content studio",
    state: "Draft ready",
    body: (
      <div className="space-y-2 rounded-[6px] border border-white/8 bg-white/[0.03] p-2">
        <Line w="72%" tone="bright" />
        <div className="space-y-1.5">
          <Line w="100%" />
          <Line w="94%" />
          <Line w="61%" tone="faint" />
        </div>
      </div>
    ),
  },
  {
    key: "leads",
    label: "Enquiries",
    state: "New enquiry",
    body: (
      <div className="space-y-1.5">
        <Row active>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sx-accent/25 font-sx-mono text-[8px] text-sx-accent">
            PS
          </span>
          <span className="flex-1 space-y-1">
            <Line w="70%" />
            <Line w="44%" tone="faint" />
          </span>
        </Row>
        <Row>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.08] font-sx-mono text-[8px] text-white/40">
            RM
          </span>
          <span className="flex-1 space-y-1">
            <Line w="58%" tone="faint" />
            <Line w="36%" tone="faint" />
          </span>
        </Row>
      </div>
    ),
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    state: "Suggested reply",
    body: (
      <div className="space-y-1.5">
        <div className="max-w-[80%] space-y-1 rounded-[6px] rounded-tl-[2px] border border-emerald-400/15 bg-emerald-400/[0.07] px-2 py-1.5">
          <Line w="86%" />
          <Line w="52%" tone="faint" />
        </div>
        <div className="ml-auto max-w-[80%] space-y-1 rounded-[6px] rounded-tr-[2px] border border-white/10 bg-white/[0.06] px-2 py-1.5">
          <Line w="78%" />
          <Line w="60%" tone="faint" />
        </div>
      </div>
    ),
  },
  {
    key: "website",
    label: "Website",
    state: "Change ready to review",
    body: (
      <div className="overflow-hidden rounded-[6px] border border-white/8">
        <div className="truncate border-b border-white/8 bg-white/[0.05] px-2 py-1 font-sx-mono text-[8px] text-white/35">
          {DEMO_BUSINESS.website}
        </div>
        <div className="space-y-1.5 bg-white/[0.02] p-2">
          <Line w="64%" tone="bright" />
          <Line w="90%" tone="faint" />
          <span className="mt-1 inline-block rounded-full bg-sx-accent/20 px-2 py-[3px] font-sx-sans text-[8.5px] text-sx-accent">
            Order ahead
          </span>
        </div>
      </div>
    ),
  },
  {
    key: "workflow",
    label: "Workflows",
    state: "Workflow ready",
    body: (
      <div className="space-y-1.5">
        {["Enquiry arrives", "Draft reply", "You approve", "Send"].map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${i < 3 ? "bg-sx-accent" : "bg-white/20"}`}
              aria-hidden
            />
            <span className={`font-sx-sans text-[10px] ${i < 3 ? "text-white/70" : "text-white/40"}`}>{step}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "analytics",
    label: "Performance",
    state: "Performance summary",
    body: (
      <div className="space-y-2">
        <div className="flex h-14 items-end gap-1">
          {[34, 52, 41, 63, 48, 71, 57].map((h, i) => (
            <span
              key={i}
              className="w-full rounded-t-[2px] bg-gradient-to-t from-sx-accent/15 to-sx-accent/55"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <Line w="72%" tone="faint" />
      </div>
    ),
  },
];

export const WORKSPACE_AREA_INDEX: Record<WorkspaceAreaKey, number> = WORKSPACE_AREAS.reduce(
  (acc, area, i) => {
    acc[area.key] = i;
    return acc;
  },
  {} as Record<WorkspaceAreaKey, number>,
);
