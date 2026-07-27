import { requireOwnerContext } from "@/lib/social/db-context";
import { listCampaigns } from "@/lib/social/repositories/campaigns";
import { listRecentVariants } from "@/lib/social/repositories/content";
import { createContentItemAction } from "../actions";

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

  const [campaigns, variants] = await Promise.all([listCampaigns(ctx), listRecentVariants(ctx, 50)]);

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
        <form action={createContentItemAction} className="grid gap-2 sm:grid-cols-2">
          <select name="campaign_id" className="saut-input">
            <option value="">No campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="title" placeholder="Title (internal)" required className="saut-input" />
          <textarea name="master_idea" placeholder="Master idea — the cross-platform concept" required rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
          <input name="objective" placeholder="Objective (e.g. awareness, leads)" className="saut-input" />
          <input name="content_pillar" placeholder="Content pillar (e.g. educational, proof)" className="saut-input" />

          <div className="saut-section-title sm:col-span-2 mt-2">First platform variant</div>
          <select name="platform" className="saut-input" defaultValue="instagram">
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="threads">Threads</option>
            <option value="linkedin">LinkedIn</option>
            <option value="youtube">YouTube</option>
          </select>
          <select name="format" className="saut-input" defaultValue="post">
            <option value="post">Post</option>
            <option value="carousel">Carousel</option>
            <option value="reel">Reel/Video</option>
            <option value="story">Story</option>
          </select>
          <textarea name="caption" placeholder="Caption" required rows={3} className="saut-input h-auto py-2 sm:col-span-2" />
          <input name="hashtags" placeholder="hashtags, comma or space separated" className="saut-input" />
          <input name="media_urls" placeholder="Media URL(s), space separated" className="saut-input" />
          <button className="saut-btn saut-btn-primary w-fit sm:col-span-2">Save</button>
        </form>
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
