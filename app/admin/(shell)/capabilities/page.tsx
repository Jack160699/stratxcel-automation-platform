import type { Metadata } from "next";
import { requireReleaseAccess } from "@/lib/release/require-release-access";
import { getServiceContext } from "@/lib/social/db-context";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { EmptyState, ErrorState } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Capability Registry — Stratxcel Admin",
  robots: { index: false, follow: false },
};

/**
 * V2/Beta technical-admin surface: a real, honest UI over capability_registry
 * (packages/agent-core's canonical, durable catalog of what the WhatsApp/
 * Admin Copilot Brain can actually do -- see docs/discovery/
 * WHATSAPP_AI_AGENCY_GAP_AUDIT.md). No fabricated rows, no synthetic
 * demo data -- every row rendered here is a real database row, and an
 * empty category renders EmptyState rather than being hidden or faked.
 */

const STATUS_CHIP: Record<string, ChipState> = {
  REAL_EXPOSED: "success",
  PARTIAL: "warning",
  REAL_NOT_EXPOSED: "accent",
  NOT_BUILT: "neutral",
  EXTERNAL_REQUIRED: "dashed",
  BROKEN: "danger",
};

const STATUS_ORDER = ["REAL_EXPOSED", "PARTIAL", "REAL_NOT_EXPOSED", "NOT_BUILT", "EXTERNAL_REQUIRED", "BROKEN"] as const;

interface CapabilityRow {
  capability_key: string;
  name: string | null;
  description: string | null;
  category: string | null;
  status: string;
  status_notes: string | null;
  external_blocker: string | null;
  agent_tool_name: string | null;
  last_verified_at: string | null;
}

export default async function CapabilityRegistryPage() {
  // V2 surface: owner-admin + Beta Mode required before any capability
  // data loads -- same guard every other Beta/Technical page uses.
  await requireReleaseAccess("v2");

  // capability_registry is service-role-only by RLS design (see its
  // migration) -- requireReleaseAccess above already established this
  // caller is an authorized owner-admin; this is the read step, not the
  // auth step.
  const { supabase } = getServiceContext();
  const { data, error } = await supabase
    .from("capability_registry")
    .select("capability_key, name, description, category, status, status_notes, external_blocker, agent_tool_name, last_verified_at")
    .order("status", { ascending: true })
    .order("capability_key", { ascending: true });

  const rows = (data ?? []) as CapabilityRow[];
  const countsByStatus = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = rows.filter((r) => r.status === s).length;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Capability Registry</h1>
        <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-sx-text-muted">
          <span>{rows.length} real capabilities tracked</span>
          {STATUS_ORDER.filter((s) => countsByStatus[s] > 0).map((s) => (
            <span key={s}>
              {s.replaceAll("_", " ").toLowerCase()}: {countsByStatus[s]}
            </span>
          ))}
        </div>
      </header>

      {error && <ErrorState message={`Could not load the capability registry: ${error.message}`} />}

      {!error && rows.length === 0 && (
        <EmptyState
          title="No capabilities recorded yet"
          subtitle="capability_registry is empty. Nothing has been catalogued yet -- this is not a loading error."
        />
      )}

      {!error &&
        STATUS_ORDER.filter((s) => countsByStatus[s] > 0).map((status) => (
          <Card key={status}>
            <CardHeading>
              {status.replaceAll("_", " ")} <span className="text-sx-text-muted font-normal">({countsByStatus[status]})</span>
            </CardHeading>
            {rows
              .filter((r) => r.status === status)
              .map((r) => (
                <CardRow key={r.capability_key}>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-sx-mono text-[11px] text-sx-text">{r.name ?? r.capability_key}</span>
                      {r.agent_tool_name && (
                        <span className="font-sx-mono text-[9.5px] uppercase tracking-[0.06em] text-sx-text-subtle">{r.agent_tool_name}</span>
                      )}
                    </div>
                    {r.description && <span className="text-[11px] text-sx-text-muted">{r.description}</span>}
                    {r.status_notes && <span className="text-[10.5px] text-sx-text-subtle italic">{r.status_notes}</span>}
                    {r.external_blocker && <span className="text-[10.5px] text-[#F3C55C]">Blocked on: {r.external_blocker}</span>}
                  </div>
                  <StatusChip state={STATUS_CHIP[r.status] ?? "neutral"}>{r.category ?? "uncategorized"}</StatusChip>
                </CardRow>
              ))}
          </Card>
        ))}
    </div>
  );
}
