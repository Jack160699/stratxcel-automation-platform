import { requireOwnerContext, getServiceContext } from "@/lib/social/db-context";
import { getBrandProfileForTenant } from "@/lib/social/repositories/brand";
import { STRATXCEL_TENANT_ID } from "@/lib/social/stratxcel-tenant";
import { Toaster } from "../components/Toaster";
import { CompanyProfileForm } from "./components/CompanyProfileForm";
import { ProductsSection } from "./components/ProductsSection";
import { AudiencesSection } from "./components/AudiencesSection";
import { PillarsSection } from "./components/PillarsSection";
import { SourcesSection } from "./components/SourcesSection";
import { RulesSection } from "./components/RulesSection";
import {
  saveBrandProfileAction,
  addProductAction,
  updateProductAction,
  removeProductAction,
  addAudienceAction,
  updateAudienceAction,
  removeAudienceAction,
  addPillarAction,
  updatePillarAction,
  removePillarAction,
  addKnowledgeSourceAction,
  updateKnowledgeSourceAction,
  removeKnowledgeSourceAction,
  addBrandRuleAction,
  updateBrandRuleAction,
  removeBrandRuleAction,
} from "./actions";

export default async function BrandBrainPage() {
  // See layout.tsx: nested pages guard independently of the parent layout.
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return null;

  // Real fix (see lib/social/repositories/brand.ts's header comment on
  // getBrandProfileForTenant AND lib/social/stratxcel-tenant.ts's own
  // header comment): must read the real customer tenant, never the
  // logged-in staff member's own identity. A first attempt at this fix
  // used resolveCurrentTenant (the "S Stratxcel ▾" switcher's own real
  // mechanism) -- confirmed live, and reverted, because it silently
  // resolved to a DIFFERENT real tenant that also happens to be named
  // "Stratxcel" (the staff member's own tenant_members row), not the real
  // customer -- the exact same class of bug this fix exists to close, just
  // one layer deeper. Matches the same explicit, hardcoded-tenant pattern
  // already established and live-verified for this admin panel's other
  // StratXcel-scoped section (app/admin/(shell)/social/system/page.tsx).
  const { supabase: service } = getServiceContext();
  const profile = await getBrandProfileForTenant(service as never, STRATXCEL_TENANT_ID);

  return (
    <div className="space-y-8 pb-24">
      {/* pb-24 keeps the last card clear of the fixed Autopilot Agent button (bottom-5 right-5, 56px) when scrolled to rest. */}
      <Toaster />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Brand Brain</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Everything the Agent grounds content generation in. Empty sections mean the Agent has less context — fill
          in what matters most first.
        </p>
      </div>

      <section className="saut-card space-y-3 p-5">
        <h2 className="saut-section-title">Company</h2>
        <CompanyProfileForm
          action={saveBrandProfileAction}
          updatedAt={profile.updated_at}
          profile={{
            name: profile.identity.name,
            industry: profile.identity.industry,
            business_model: profile.identity.business_model,
            positioning: profile.identity.positioning,
            description: profile.identity.description,
            voice_tone: profile.voice.tone.join(", "),
            voice_avoid: profile.voice.blocked_phrases.join(", "),
          }}
        />
      </section>

      <ProductsSection items={profile.products} addAction={addProductAction} updateAction={updateProductAction} removeAction={removeProductAction} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AudiencesSection
          items={profile.audiences}
          addAction={addAudienceAction}
          updateAction={updateAudienceAction}
          removeAction={removeAudienceAction}
        />
        <PillarsSection
          items={profile.content_pillars}
          addAction={addPillarAction}
          updateAction={updatePillarAction}
          removeAction={removePillarAction}
        />
      </div>

      <SourcesSection
        items={profile.source_material}
        addAction={addKnowledgeSourceAction}
        updateAction={updateKnowledgeSourceAction}
        removeAction={removeKnowledgeSourceAction}
      />

      <RulesSection items={profile.rules} addAction={addBrandRuleAction} updateAction={updateBrandRuleAction} removeAction={removeBrandRuleAction} />
    </div>
  );
}
