import { requireClientContext } from "@/lib/tenants/client-context";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { ContentLibraryClient, type ContentItem } from "./ContentLibraryClient";
import { isBrandOrLogoAsset } from "@/lib/social/brand-asset-filter";

export const dynamic = "force-dynamic";

// Real bug found live: the BrandBrain Logo Engine's 4 generated variants
// (transparent/monoLight/monoDark/badge) are real social_media_assets
// rows (provenance.purpose: "logo_variant" -- see lib/brand/logo-
// analyzer.ts / app/api/platform/brand/logo-analyze/route.ts), and this
// query pulled every READY asset for the tenant with no purpose filter
// at all, so they showed up as ordinary content cards. Excluded via
// PostgREST's "not contains" (`cs` negated) rather than a plain
// `.neq("provenance->>purpose", ...)`: a NULL/absent purpose key would
// make a `!=` comparison evaluate to NULL (excluded) in SQL, which would
// have silently hidden every asset with no recorded purpose at all --
// verified live against real provenance shapes (logo_variant excluded,
// shop_profile_photo and {} both still included) before shipping this.
const LOGO_VARIANT_PROVENANCE_FILTER = JSON.stringify({ purpose: "logo_variant" });

async function loadTenantMedia(supabase: any, tenantId: string, activeBrandBrain?: any) {
  try {
    const { data: assets } = await supabase
      .from("social_media_assets")
      .select("id, original_name, mime_type, storage_bucket, storage_path, created_at, status, provenance, source_type, generation_job_id")
      .eq("tenant_id", tenantId)
      .eq("status", "READY")
      .not("provenance", "cs", LOGO_VARIANT_PROVENANCE_FILTER)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!assets || assets.length === 0) return [];

    // Filter out brand assets, logo variants, and non-publishing media
    const contentAssets = assets.filter((a: any) => !isBrandOrLogoAsset(a, activeBrandBrain));

    const items: Array<{ id: string; name: string; url: string; mimeType: string; createdAt: string }> = [];
    for (const a of contentAssets) {
      try {
        const { data: signed } = await supabase.storage.from(a.storage_bucket).createSignedUrl(a.storage_path, 3600);
        if (signed?.signedUrl) {
          items.push({
            id: a.id,
            name: a.original_name || "Media Asset",
            url: signed.signedUrl,
            mimeType: a.mime_type || "image/jpeg",
            createdAt: a.created_at,
          });
        }
      } catch {
        // storage sign error ignored
      }
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Real, production-persisted Social Autopilot / Creative Studio image
 * generations for this tenant -- replaces the previous generatePosterSvg()
 * mock generator and its schema-mismatched loadImageJobs() query (which
 * read `prompt`/`style_preset`, columns that don't exist on
 * image_generation_jobs; see 20260812104243_image_generation_v1.sql and
 * the Subscription-Gated Visual Archetypes brief's real schema). Reads the
 * REAL job/candidate/asset chain: job -> selected_candidate ->
 * social_media_assets -> a signed preview URL, plus the job's own
 * creative_treatment for its concept, CTA, and layout archetype -- never a
 * fabricated poster.
 */
async function loadImageGenerationCreatives(supabase: any, tenantId: string) {
  try {
    const { data: jobs } = await supabase
      .from("image_generation_jobs")
      .select("id, status, brief, creative_treatment, aspect_ratio, selected_candidate_id, safe_error, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (!jobs || jobs.length === 0) return [];

    // Real bug found live: image_generation_jobs.selected_candidate_id is
    // only ever populated by an explicit, separate "select a candidate"
    // action (Creative Studio's multi-candidate review flow) --
    // Social Autopilot's manual generation never called it, so every one
    // of its READY jobs had real, generated candidates but a permanently
    // null selected_candidate_id, and this page's imageUrl lookup came back
    // empty every time (falling back to the text-only card -- "rendering
    // the raw text prompt instead of the actual thumbnail"). Fixed at the
    // source for new jobs (manual-generate now auto-selects), but every
    // job already sitting in production needs this same defensive fallback
    // to actually display: fetch EVERY job's candidates, not just the
    // explicitly-selected one, and fall back to the best available
    // (SELECTED > oldest non-REJECTED) when no selection was ever made.
    const jobIds = jobs.map((j: any) => j.id);
    const candidatesByJobId = new Map<string, Array<{ id: string; asset_id: string; status: string; created_at: string }>>();
    if (jobIds.length > 0) {
      const { data: candidates } = await supabase
        .from("image_generation_candidates")
        .select("id, job_id, asset_id, status, created_at")
        .in("job_id", jobIds)
        .order("created_at", { ascending: true });
      for (const c of candidates ?? []) {
        const list = candidatesByJobId.get(c.job_id) ?? [];
        list.push(c);
        candidatesByJobId.set(c.job_id, list);
      }
    }

    function pickBestCandidate(job: any) {
      const list = candidatesByJobId.get(job.id) ?? [];
      if (job.selected_candidate_id) {
        const explicit = list.find((c) => c.id === job.selected_candidate_id);
        if (explicit) return explicit;
      }
      const selected = list.find((c) => c.status === "SELECTED");
      if (selected) return selected;
      return list.find((c) => c.status !== "REJECTED") ?? null;
    }

    const assetIds = [...candidatesByJobId.values()].flat().map((c) => c.asset_id);
    const signedUrlByAssetId = new Map<string, string>();
    if (assetIds.length > 0) {
      const { data: assets } = await supabase
        .from("social_media_assets")
        .select("id, storage_bucket, storage_path")
        .in("id", assetIds);
      for (const asset of assets ?? []) {
        try {
          const { data: signed } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 3600);
          if (signed?.signedUrl) signedUrlByAssetId.set(asset.id, signed.signedUrl);
        } catch {
          // storage sign error ignored -- card renders without a preview image
        }
      }
    }

    return jobs.map((job: any) => {
      const candidate = pickBestCandidate(job);
      const imageUrl = candidate ? signedUrlByAssetId.get(candidate.asset_id) ?? null : null;
      // Real field-name bug found live: this used to read treatment.
      // ctaDirection, a key that has never existed on CreativeTreatment
      // (lib/social/creative-treatment.ts) -- the real CTA lives at
      // treatment.cta.text (a CtaDecision object), so every card's
      // "objective" line was silently always empty regardless of what the
      // treatment actually specified.
      const treatment = (job.creative_treatment ?? null) as Record<string, unknown> | null;
      const concept = typeof treatment?.concept === "string" ? treatment.concept : null;
      const layoutArchetype = typeof treatment?.layoutArchetype === "string" ? treatment.layoutArchetype : null;
      const cta = treatment?.cta as { text?: unknown } | undefined;
      const ctaText = typeof cta?.text === "string" && cta.text.trim() ? cta.text : null;
      return {
        id: job.id,
        title: concept || job.brief || "Untitled creative",
        status: job.status as string,
        imageUrl,
        aspectRatio: job.aspect_ratio || null,
        createdAt: job.created_at,
        captionText: job.brief || null,
        layoutArchetype,
        ctaDirection: ctaText,
        errorMessage: job.status === "FAILED" ? job.safe_error : null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Real text captions/drafts for this tenant (Content Library Cleanup
 * mission Task A/B: the mission's guessed table name `social_drafts`
 * doesn't exist -- confirmed via live schema introspection. The real
 * table is content_variants, a per-platform text/copy row joined to its
 * parent content_master idea; content_variants itself has no tenant_id
 * column, so scoping goes through content_master).
 *
 * A second real finding, live: content_master uses DUAL scoping --
 * `createContentMaster` (lib/social/repositories/content.ts) writes
 * `tenant_id` only for a genuine tenant-agent context, but real
 * package-autopilot.ts callers (lib/social/package-autopilot.ts) pass an
 * OwnerContext instead, which writes `owner_id` (a legacy pre-tenant
 * identity -- the bound social_brand_profiles.owner_id, NOT
 * ctx.workspaceTenant.tenantId). Confirmed via live introspection: every
 * real content_master row today has tenant_id: null and a real owner_id.
 * A query scoped only by tenant_id would silently return zero rows for
 * every real tenant's actual package-autopilot-generated captions -- so
 * this resolves the tenant's bound brand profile's owner_id first and
 * matches on EITHER column, covering both the legacy owner-scoped path
 * real data uses today and the tenant-scoped path forward-compatibly.
 */
/** Same social_content_variant_media -> social_media_assets -> signed URL
 * join the Pipeline and Calendar pages use. Package Autopilot content
 * never populates content_variants.media_urls (prepareNearTermPackage
 * Items hardcodes it to []) -- the real, generated image only exists as a
 * link via this join table, so a caption card that skips it renders
 * text-only even when a real image is attached. */
async function resolveVariantThumbnails(supabase: any, variantIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!variantIds.length) return result;
  const { data: links } = await supabase
    .from("social_content_variant_media")
    .select("variant_id, asset_id, position")
    .in("variant_id", variantIds)
    .order("position", { ascending: true });
  if (!links?.length) return result;
  const firstAssetByVariant = new Map<string, string>();
  for (const link of links) {
    if (!firstAssetByVariant.has(link.variant_id)) firstAssetByVariant.set(link.variant_id, link.asset_id);
  }
  const assetIds = [...new Set(firstAssetByVariant.values())];
  const { data: assets } = await supabase
    .from("social_media_assets")
    .select("id, storage_bucket, storage_path")
    .eq("status", "READY")
    .in("id", assetIds);
  const assetById = new Map((assets ?? []).map((a: any) => [a.id, a]));
  await Promise.all(
    [...firstAssetByVariant.entries()].map(async ([variantId, assetId]) => {
      const asset = assetById.get(assetId) as { storage_bucket: string; storage_path: string } | undefined;
      if (!asset) return;
      const { data: signed } = await supabase.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 3600);
      if (signed?.signedUrl) result.set(variantId, signed.signedUrl);
    })
  );
  return result;
}

async function loadTextCaptions(supabase: any, tenantId: string) {
  try {
    const { data: brandProfile } = await supabase
      .from("social_brand_profiles")
      .select("owner_id")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    const ownerId = brandProfile?.owner_id as string | undefined;

    let mastersQuery = supabase.from("content_master").select("id, title");
    mastersQuery = ownerId ? mastersQuery.or(`tenant_id.eq.${tenantId},owner_id.eq.${ownerId}`) : mastersQuery.eq("tenant_id", tenantId);
    const { data: masters } = await mastersQuery.order("created_at", { ascending: false }).limit(30);
    if (!masters || masters.length === 0) return [];
    const masterIds = masters.map((m: any) => m.id);
    const titleByMasterId = new Map(masters.map((m: any) => [m.id, m.title as string | null]));

    const { data: variants } = await supabase
      .from("content_variants")
      .select("id, master_id, platform, format, caption, hashtags, status, created_at")
      .in("master_id", masterIds)
      .order("created_at", { ascending: false })
      .limit(15);
    const variantIds = (variants ?? []).map((v: any) => v.id);
    const thumbnails = await resolveVariantThumbnails(supabase, variantIds);
    return (variants ?? []).map((v: any) => ({
      id: v.id,
      title: titleByMasterId.get(v.master_id) || "Untitled draft",
      platform: v.platform as string | null,
      captionText: v.caption as string | null,
      hashtags: (v.hashtags as string[] | null) ?? [],
      status: v.status as string,
      createdAt: v.created_at,
      imageUrl: thumbnails.get(v.id) ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Primary Content & Media Hub — central workspace for creatives, posters,
 * drafts, and published content for the active tenant.
 */
export default async function CustomerContentPage() {
  const ctx = await requireClientContext();
  if (!ctx.ok) return null;

  const tenantId = ctx.workspaceTenant.tenantId;
  const tenantDb = ctx.supabase;

  // Load tenant brain first to provide active brand context for filtering
  const brain = await getCurrentBrandBrain(tenantDb, tenantId).catch(() => null);

  const [mediaAssets, generations, captions] = await Promise.all([
    loadTenantMedia(tenantDb, tenantId, brain),
    loadImageGenerationCreatives(tenantDb, tenantId),
    loadTextCaptions(tenantDb, tenantId),
  ]);

  const brainContent = brain?.content as Record<string, unknown> | undefined;
  const businessName =
    (brainContent?.business_name as string | undefined) ||
    ctx.workspaceTenant.name ||
    "Your Business";

  const items: ContentItem[] = [];

  // 1. Real uploaded/generated media assets with signed URLs
  for (const media of mediaAssets) {
    items.push({
      id: media.id,
      title: media.name,
      type: media.mimeType.startsWith("video/") ? "video" : "creative",
      category: "saved",
      imageUrl: media.url,
      aspectRatio: "1:1",
      createdAt: media.createdAt,
      status: "READY",
      captionText: `${media.name} — Asset saved in Brand Library.`,
      deleteKind: "social_media_asset",
    });
  }

  // 2. Real image_generation_jobs, with the actual layout archetype and
  // job status this tenant's own pipeline produced -- no synthetic poster,
  // no placeholder copy. A job with no selected candidate yet (still
  // generating, or failed before one was chosen) renders with no preview
  // image; the card falls back to its text-only presentation rather than
  // fabricating one.
  for (const gen of generations) {
    items.push({
      id: gen.id,
      title: gen.title,
      type: "poster",
      category: gen.status === "READY" ? "generated" : gen.status === "FAILED" ? "draft" : "generated",
      imageUrl: gen.imageUrl ?? undefined,
      aspectRatio: gen.aspectRatio ?? "1:1",
      createdAt: gen.createdAt,
      status: gen.status as ContentItem["status"],
      captionText: gen.captionText ?? undefined,
      layoutArchetype: gen.layoutArchetype ?? undefined,
      objective: gen.ctaDirection ?? undefined,
      errorMessage: gen.errorMessage ?? undefined,
      deleteKind: "image_generation_job",
    });
  }

  // 3. Real text captions/drafts (content_variants) -- pure copy, never an
  // image job with a missing thumbnail. Kept as its own distinct item type
  // ("caption") so the Captions tab filters real data instead of staying
  // permanently empty.
  for (const draft of captions) {
    items.push({
      id: draft.id,
      title: draft.title,
      type: "caption",
      category: draft.status === "READY" ? "saved" : "draft",
      imageUrl: draft.imageUrl ?? undefined,
      aspectRatio: "1:1",
      createdAt: draft.createdAt,
      status: (draft.status === "READY" ? "READY" : "DRAFT") as ContentItem["status"],
      captionText: draft.captionText ?? undefined,
      platform: (draft.platform as ContentItem["platform"]) ?? undefined,
      deleteKind: "content_variant",
    });
  }

  return (
    <div className="sx-customer-app mx-auto w-full max-w-[1080px] pb-20 md:pb-8">
      <ContentLibraryClient businessName={businessName} initialItems={items} />
    </div>
  );
}
