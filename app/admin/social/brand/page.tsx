import { requireOwnerContext } from "@/lib/social/db-context";
import { getBrandProfile } from "@/lib/social/repositories/brand";
import {
  saveBrandProfileAction,
  addProductAction,
  removeProductAction,
  addAudienceAction,
  removeAudienceAction,
  addPillarAction,
  removePillarAction,
  addKnowledgeSourceAction,
  removeKnowledgeSourceAction,
  addBrandRuleAction,
  removeBrandRuleAction,
} from "./actions";

const RULE_KINDS = ["forbidden_claim", "disclaimer", "terminology", "competitor_policy", "cta_rule"];

export default async function BrandBrainPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  const profile = await getBrandProfile(ctx);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brand Brain</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Everything the Agent grounds content generation in. Empty sections mean the Agent has less context — fill
          in what matters most first.
        </p>
      </div>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Company</h2>
        <form action={saveBrandProfileAction} className="grid gap-2 sm:grid-cols-2">
          <input name="company_name" defaultValue={profile.identity.name ?? ""} placeholder="Company name" className="saut-input" />
          <input name="industry" defaultValue={profile.identity.industry ?? ""} placeholder="Industry" className="saut-input" />
          <input name="business_model" defaultValue={profile.identity.business_model ?? ""} placeholder="Business model" className="saut-input sm:col-span-2" />
          <input name="positioning" defaultValue={profile.identity.positioning ?? ""} placeholder="Positioning (one sentence)" className="saut-input sm:col-span-2" />
          <textarea name="description" defaultValue={profile.identity.description ?? ""} placeholder="Description" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
          <input name="voice_tone" defaultValue={profile.voice.tone.join(", ")} placeholder="Tone words, comma separated (e.g. clear, premium, practical)" className="saut-input" />
          <input name="voice_avoid" defaultValue={profile.voice.blocked_phrases.join(", ")} placeholder="Blocked phrases, comma separated" className="saut-input" />
          <button className="saut-btn saut-btn-primary w-fit sm:col-span-2">Save</button>
        </form>
      </section>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Products &amp; services</h2>
        <form action={addProductAction} className="grid gap-2 sm:grid-cols-2">
          <input name="name" placeholder="Name" required className="saut-input" />
          <input name="cta" placeholder="Call to action" className="saut-input" />
          <input name="audience" placeholder="Audience" className="saut-input" />
          <input name="url" placeholder="URL" className="saut-input" />
          <textarea name="description" placeholder="Description" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
          <button className="saut-btn saut-btn-primary w-fit sm:col-span-2">Add product</button>
        </form>
        <div className="space-y-2">
          {profile.products.map((p, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
              <span className="font-medium">{p.name}</span>
              <form action={removeProductAction}>
                <input type="hidden" name="index" value={i} />
                <button className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Remove</button>
              </form>
            </div>
          ))}
          {profile.products.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No products yet.</p>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="saut-card space-y-3 p-5">
          <h2 className="saut-section-title">Audiences</h2>
          <form action={addAudienceAction} className="space-y-2">
            <input name="name" placeholder="Segment name" required className="saut-input w-full" />
            <textarea name="pain_points" placeholder="Pain points" rows={2} className="saut-input h-auto w-full py-2" />
            <button className="saut-btn saut-btn-primary">Add</button>
          </form>
          <div className="space-y-2">
            {profile.audiences.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
                <span>{a.name}</span>
                <form action={removeAudienceAction}>
                  <input type="hidden" name="index" value={i} />
                  <button className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Remove</button>
                </form>
              </div>
            ))}
            {profile.audiences.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No audiences yet.</p>}
          </div>
        </section>

        <section className="saut-card space-y-3 p-5">
          <h2 className="saut-section-title">Content pillars</h2>
          <form action={addPillarAction} className="space-y-2">
            <input name="name" placeholder="Pillar name" required className="saut-input w-full" />
            <textarea name="description" placeholder="Description" rows={2} className="saut-input h-auto w-full py-2" />
            <button className="saut-btn saut-btn-primary">Add</button>
          </form>
          <div className="space-y-2">
            {profile.content_pillars.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
                <span>{p.name}</span>
                <form action={removePillarAction}>
                  <input type="hidden" name="index" value={i} />
                  <button className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Remove</button>
                </form>
              </div>
            ))}
            {profile.content_pillars.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No pillars yet.</p>}
          </div>
        </section>
      </div>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Knowledge sources</h2>
        <form action={addKnowledgeSourceAction} className="grid gap-2 sm:grid-cols-2">
          <select name="kind" className="saut-input" defaultValue="note">
            <option value="note">Note</option>
            <option value="url">URL</option>
            <option value="document">Document</option>
          </select>
          <input name="title" placeholder="Title" required className="saut-input" />
          <input name="source_url" placeholder="Source URL (if applicable)" className="saut-input sm:col-span-2" />
          <textarea name="content" placeholder="Content / notes" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
          <button className="saut-btn saut-btn-primary w-fit sm:col-span-2">Add source</button>
        </form>
        <div className="space-y-2">
          {profile.source_material.map((k, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
              <span>
                <span className="saut-mono mr-2 text-[10px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>{k.kind}</span>
                {k.title}
              </span>
              <form action={removeKnowledgeSourceAction}>
                <input type="hidden" name="index" value={i} />
                <button className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Remove</button>
              </form>
            </div>
          ))}
          {profile.source_material.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No knowledge sources yet.</p>}
        </div>
      </section>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Rules</h2>
        <form action={addBrandRuleAction} className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
          <select name="kind" className="saut-input" defaultValue="forbidden_claim">
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input name="text" placeholder="Rule text" required className="saut-input" />
          <button className="saut-btn saut-btn-primary">Add</button>
        </form>
        <div className="space-y-2">
          {profile.rules.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
              <span>
                <span className="saut-mono mr-2 text-[10px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>{r.kind.replace(/_/g, " ")}</span>
                {r.text}
              </span>
              <form action={removeBrandRuleAction}>
                <input type="hidden" name="index" value={i} />
                <button className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>Remove</button>
              </form>
            </div>
          ))}
          {profile.rules.length === 0 && <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>No rules yet.</p>}
        </div>
      </section>
    </div>
  );
}
