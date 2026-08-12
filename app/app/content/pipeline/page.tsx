import { requireClientContext } from "@/lib/tenants/client-context";
import { Card, CardHeading } from "@/components/ui/Card";
import { StaffScopedNotice } from "../StaffScopedNotice";
import { UseGeneratedAsset } from "./UseGeneratedAsset";

const STAGES = ["Draft", "Awaiting approval", "Scheduled", "Published"];

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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Pipeline</h1>
        <p className="mt-1 text-sm text-sx-text-muted">Every piece of content, from draft to published.</p>
      </header>

      <StaffScopedNotice what="Pipeline" />

      {generated ? <UseGeneratedAsset generated={generated} variants={variants} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((stage) => (
          <Card key={stage} variant="nested" className="min-h-[160px]">
            <CardHeading>{stage}</CardHeading>
            <p className="mt-3 text-xs text-sx-text-subtle">Nothing here.</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
