import { requireClientContext } from "@/lib/tenants/client-context";
import { getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { ContentLibraryClient, type ContentItem } from "./ContentLibraryClient";

export const dynamic = "force-dynamic";

async function loadTenantMedia(supabase: any, tenantId: string) {
  try {
    const { data: assets } = await supabase
      .from("social_media_assets")
      .select("id, original_name, mime_type, storage_bucket, storage_path, created_at, status")
      .eq("tenant_id", tenantId)
      .eq("status", "READY")
      .order("created_at", { ascending: false })
      .limit(15);

    if (!assets || assets.length === 0) return [];

    const items: Array<{ id: string; name: string; url: string; mimeType: string; createdAt: string }> = [];
    for (const a of assets) {
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

    const selectedCandidateIds = jobs.map((j: any) => j.selected_candidate_id).filter(Boolean) as string[];
    const candidatesById = new Map<string, { asset_id: string; width: number | null; height: number | null }>();
    if (selectedCandidateIds.length > 0) {
      const { data: candidates } = await supabase
        .from("image_generation_candidates")
        .select("id, asset_id, width, height")
        .in("id", selectedCandidateIds);
      for (const c of candidates ?? []) candidatesById.set(c.id, c);
    }

    const assetIds = [...candidatesById.values()].map((c) => c.asset_id);
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
      const candidate = job.selected_candidate_id ? candidatesById.get(job.selected_candidate_id) : null;
      const imageUrl = candidate ? signedUrlByAssetId.get(candidate.asset_id) ?? null : null;
      const treatment = (job.creative_treatment ?? null) as Record<string, unknown> | null;
      const concept = typeof treatment?.concept === "string" ? treatment.concept : null;
      const layoutArchetype = typeof treatment?.layoutArchetype === "string" ? treatment.layoutArchetype : null;
      const ctaDirection = typeof treatment?.ctaDirection === "string" ? treatment.ctaDirection : null;
      return {
        id: job.id,
        title: concept || job.brief || "Untitled creative",
        status: job.status as string,
        imageUrl,
        aspectRatio: job.aspect_ratio || null,
        createdAt: job.created_at,
        captionText: job.brief || null,
        layoutArchetype,
        ctaDirection,
        errorMessage: job.status === "FAILED" ? job.safe_error : null,
      };
    });
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

  const [brain, mediaAssets, generations] = await Promise.all([
    getCurrentBrandBrain(tenantDb, tenantId).catch(() => null),
    loadTenantMedia(tenantDb, tenantId),
    loadImageGenerationCreatives(tenantDb, tenantId),
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
    });
  }

  return (
    <div className="sx-customer-app mx-auto w-full max-w-[1080px] pb-20 md:pb-8">
      <ContentLibraryClient businessName={businessName} initialItems={items} />
    </div>
  );
}
