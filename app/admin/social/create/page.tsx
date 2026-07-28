import { requireOwnerContext } from "@/lib/social/db-context";
import { getBrandProfile } from "@/lib/social/repositories/brand";
import { listCampaigns } from "@/lib/social/repositories/campaigns";
import { listRecentVariants } from "@/lib/social/repositories/content";
import { CreateContentForm } from "./CreateContentForm";

const STATUS_CHIP: Record<string, string> = {
  IDEA: "saut-chip-neutral",
  GENERATING: "saut-chip-ai",
  READY: "saut-chip-info",
  SCHEDULED: "saut-chip-info",
  PUBLISHED: "saut-chip-success",
  FAILED: "saut-chip-danger",
};

export default async function CreatePage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const [campaigns, variants, brandProfile] = await Promise.all([
    listCampaigns(ctx),
    listRecentVariants(ctx, 50),
    getBrandProfile(ctx),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Draft a master idea and its first platform variant directly, or ask the Agent (bottom right) to propose a
          concept from a goal — it will create content here once you approve a direction.
        </p>
      </div>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">New content</h2>
        <CreateContentForm
          campaigns={campaigns.map(({ id, name }) => ({ id, name }))}
          contentPillars={brandProfile.content_pillars.map(({ name }) => name)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="saut-section-title">Library</h2>
        <div className="space-y-2">
          {variants.map((v: Record<string, unknown>) => {
            const master = v.content_master as { title?: string; content_pillar?: string } | null;
            return (
              <div key={v.id as string} className="saut-card flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{master?.title ?? (v.caption as string)?.slice(0, 60)}</span>
                  <span className="ml-2 text-xs capitalize" style={{ color: "var(--saut-text-subtle)" }}>
                    {v.platform as string}
                  </span>
                </div>
                <span className={`saut-chip ${STATUS_CHIP[v.status as string] ?? "saut-chip-neutral"}`}>
                  <span className="saut-chip-dot" /> {(v.status as string).toLowerCase()}
                </span>
              </div>
            );
          })}
          {variants.length === 0 && (
            <div className="saut-card p-6 text-center text-sm" style={{ color: "var(--saut-text-subtle)" }}>
              Nothing created yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
