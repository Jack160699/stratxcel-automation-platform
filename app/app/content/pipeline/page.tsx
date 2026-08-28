import Link from "next/link";
import { requireClientContext } from "@/lib/tenants/client-context";
import { Card, CardHeading } from "@/components/ui/Card";
import { StaffScopedNotice } from "../StaffScopedNotice";
import { UseGeneratedAsset } from "./UseGeneratedAsset";

const STAGES = ["Draft", "Awaiting approval", "Scheduled", "Published"] as const;
type Stage = (typeof STAGES)[number];

/** Maps social_autopilot_queue_items.status (package-autopilot.ts's
 * QueueItemStatus) onto this page's generic stages. FAILED/SKIPPED/
 * SHADOW_COMPLETED are deliberately left out of this high-level Kanban --
 * they belong to the dedicated autopilot dashboard's history view, which
 * already surfaces them with real error copy. */
const STAGE_BY_STATUS: Record<string, Stage> = {
  PLANNED: "Draft",
  PREPARED: "Draft",
  BLOCKED: "Draft",
  REVIEW_REQUIRED: "Awaiting approval",
  SCHEDULED: "Scheduled",
  EXECUTING: "Scheduled",
  PUBLISHED: "Published",
};

interface PipelineCard {
  id: string;
  scheduledAt: string;
  status: string;
  platform: string | null;
  caption: string;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Pipeline — kanban-style content stages. Real structure per PAGE_BY_PAGE_SPECIFICATIONS.md; generalizes Social Autopilot's approval/publish flow. */
export default async function ContentPipelinePage({ searchParams }: { searchParams: Promise<{ mediaAssetId?: string; generationJobId?: string }> }) {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;
  const { mediaAssetId, generationJobId } = await searchParams;
  let generated: { jobId: string; candidateId: string; assetId: string } | null = null;
  let variants: Array<{ id: string; label: string }> = [];
  if (ctx.accessMode === "customer" && mediaAssetId && generationJobId) {
    const { data: candidate } = await ctx.supabase
      .from("image_generation_candidates")
      .select("id,asset_id,job_id,status")
      .eq("tenant_id", ctx.workspaceTenant.tenantId)
      .eq("job_id", generationJobId)
      .eq("asset_id", mediaAssetId)
      .eq("status", "SELECTED")
      .maybeSingle();
    if (candidate) {
      generated = { jobId: candidate.job_id, candidateId: candidate.id, assetId: candidate.asset_id };
      const { data: masters } = await ctx.supabase.from("content_master").select("id,title").eq("owner_id", ctx.userId).order("created_at", { ascending: false }).limit(50);
      const masterIds = (masters ?? []).map((master) => master.id);
      if (masterIds.length) {
        const { data: rows } = await ctx.supabase.from("content_variants").select("id,master_id,platform,status").in("master_id", masterIds).order("created_at", { ascending: false });
        const labels = new Map((masters ?? []).map((master) => [master.id, master.title]));
        variants = (rows ?? []).map((row) => ({ id: row.id, label: `${labels.get(row.master_id) ?? "Post"} · ${row.platform} · ${row.status}` }));
      }
    }
  }

  // Real gap found live: this page's 4 columns were hardcoded "Nothing
  // here." with zero data query of any kind -- it would read empty even
  // for a tenant with dozens of real published posts. Wired to the SAME
  // social_autopilot_queue_items source the Autopilot dashboard's
  // upcoming/history sections already use (RLS-safe on ctx.supabase --
  // social_autopilot_queue_items_tenant_read scopes by the authorization's
  // own client_user_id, exactly like the content_variants read above).
  const columns = new Map<Stage, PipelineCard[]>(STAGES.map((stage) => [stage, []]));
  const { data: queueRows } = await ctx.supabase
    .from("social_autopilot_queue_items")
    .select("id, scheduled_at, status, social_accounts(platform), content_variants(caption)")
    .eq("tenant_id", ctx.workspaceTenant.tenantId)
    .in("status", Object.keys(STAGE_BY_STATUS))
    .order("scheduled_at", { ascending: true })
    .limit(100);
  for (const row of queueRows ?? []) {
    const stage = STAGE_BY_STATUS[row.status as string];
    if (!stage) continue;
    columns.get(stage)!.push({
      id: row.id,
      scheduledAt: row.scheduled_at,
      status: row.status,
      platform: (row.social_accounts as { platform?: string } | null)?.platform ?? null,
      caption: (row.content_variants as { caption?: string } | null)?.caption ?? "",
    });
  }
  const hasAnyContent = [...columns.values()].some((cards) => cards.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Pipeline</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Every piece of content, from draft to published.</p>
      </header>

      <StaffScopedNotice what="Pipeline" accessMode={ctx.accessMode} />

      {generated ? <UseGeneratedAsset generated={generated} variants={variants} /> : null}

      {!hasAnyContent && (
        <Card variant="nested" className="p-4">
          <p className="text-sm text-sx-text-muted">
            Nothing in the pipeline yet — this fills up once Social Autopilot is activated (or you schedule content manually).{" "}
            <Link href="/app/content/autopilot" className="font-semibold text-sx-accent hover:underline">
              Set up Social Autopilot →
            </Link>
          </p>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const cards = columns.get(stage) ?? [];
          return (
            <Card key={stage} variant="nested" className="min-h-[160px]">
              <CardHeading>{stage} {cards.length > 0 && <span className="text-sx-text-subtle">({cards.length})</span>}</CardHeading>
              {cards.length === 0 ? (
                <p className="mt-3 text-xs text-sx-text-subtle">Nothing here.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2">
                  {cards.map((card) => (
                    <div key={card.id} className="rounded-sx-sm border border-sx-border bg-sx-surface-1 p-2 text-xs">
                      <p className="font-semibold text-sx-text">{card.platform ?? "—"} · {fmtWhen(card.scheduledAt)}</p>
                      {card.caption && <p className="mt-1 truncate text-sx-text-muted">{card.caption}</p>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
