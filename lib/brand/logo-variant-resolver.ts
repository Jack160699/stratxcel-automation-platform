/**
 * BrandBrain Logo Engine Phase 4: the real production bridge between a
 * tenant's saved brand_brains content and the deterministic compositor's
 * `logoVariants` input (lib/social/text-overlay-render.ts). Resolves each
 * configured variant's social_media_assets row into an actual data URI --
 * the compositor never fetches remote URLs itself (every other asset it
 * touches is already a resolved data URI too), and a signed
 * display-convenience URL persisted in brand_brains content would
 * eventually expire anyway, so this always re-downloads fresh bytes from
 * the durable assetId reference instead of trusting any stored URL.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LogoAsset, LogoVariantBundle, LogoVariantKind } from "../social/text-overlay-render.ts";

const LOGO_VARIANT_KINDS: LogoVariantKind[] = ["transparent", "monoLight", "monoDark", "badge"];

interface StoredLogoVariants {
  transparent?: { assetId?: string };
  monoLight?: { assetId?: string };
  monoDark?: { assetId?: string };
  badge?: { assetId?: string };
}

async function resolveOneVariant(supabase: SupabaseClient, tenantId: string, assetId: string): Promise<LogoAsset | null> {
  const { data: asset } = await supabase
    .from("social_media_assets")
    .select("storage_bucket, storage_path, mime_type, provenance")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .eq("status", "READY")
    .maybeSingle();
  if (!asset) return null;
  if (!["image/png", "image/jpeg", "image/webp"].includes(asset.mime_type)) return null;

  const { data: file, error } = await supabase.storage.from(asset.storage_bucket).download(asset.storage_path);
  if (error || !file) return null;

  const provenance = (asset.provenance ?? {}) as { width?: unknown; height?: unknown };
  const width = typeof provenance.width === "number" && provenance.width > 0 ? provenance.width : null;
  const height = typeof provenance.height === "number" && provenance.height > 0 ? provenance.height : null;
  // Real fallback when a variant's provenance is missing dimensions (e.g.
  // a manually-inserted or legacy asset): decode just enough to measure
  // it rather than assuming a square, which would silently stretch a
  // non-square logo when composited.
  const aspectRatio = width && height ? width / height : await measureAspectRatioFallback(file);
  if (!aspectRatio || aspectRatio <= 0) return null;

  const bytes = Buffer.from(await file.arrayBuffer());
  const dataUri = `data:${asset.mime_type};base64,${bytes.toString("base64")}`;
  return { dataUri, mimeType: asset.mime_type as LogoAsset["mimeType"], aspectRatio };
}

async function measureAspectRatioFallback(file: Blob): Promise<number | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
    if (!meta.width || !meta.height) return null;
    return meta.width / meta.height;
  } catch {
    return null;
  }
}

/**
 * Reads a tenant's `logo_variants` (brand_brains content JSONB -- no
 * migration, per the approved design) and resolves every configured
 * variant into a real, ready-to-composite LogoAsset. Missing/unconfigured
 * variants are simply absent from the returned bundle -- selectLogoVariant
 * already has a real fallback chain for a partial bundle. Returns null
 * when the tenant has no logo_variants at all (never saved one, or saved
 * a logo before the Logo Engine shipped and only has the legacy
 * `logo_url` string).
 */
/**
 * Legacy/backward-compat fallback (Unify Creative Studio mission): a
 * tenant who saved `logo_url` (a plain remote URL string) but has no
 * `logo_variants` bundle at all -- either they saved a logo before the
 * Logo Engine shipped, or their variant assets were later deleted while
 * the display string stayed -- would otherwise get ZERO logo composited,
 * even though selectLogoVariant (text-overlay-render.ts) already has a
 * real `logoImage` fallback path built for exactly this case; the
 * production caller (lib/image-generation/service.ts) just never fed it
 * one. Re-fetches and re-encodes the URL itself rather than trusting it to
 * still be reachable/valid at render time (matching resolveOneVariant's
 * own "never trust a stored display URL" rule above), and measures its
 * real aspect ratio so it's never stretched when composited. Best-effort:
 * any failure (network, non-image response, corrupt file) returns null --
 * never blocks generation, same as every other logo lookup in this file.
 */
export async function resolveLegacyLogoImage(logoUrl: string): Promise<LogoAsset | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim();
    if (!mimeType || !["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return null;
    const blob = await response.blob();
    const aspectRatio = await measureAspectRatioFallback(blob);
    if (!aspectRatio || aspectRatio <= 0) return null;
    const bytes = Buffer.from(await blob.arrayBuffer());
    const dataUri = `data:${mimeType};base64,${bytes.toString("base64")}`;
    return { dataUri, mimeType: mimeType as LogoAsset["mimeType"], aspectRatio };
  } catch {
    return null;
  }
}

export async function resolveLogoVariantBundle(supabase: SupabaseClient, tenantId: string, storedVariants: unknown): Promise<LogoVariantBundle | null> {
  if (!storedVariants || typeof storedVariants !== "object") return null;
  const stored = storedVariants as StoredLogoVariants;

  const entries = await Promise.all(
    LOGO_VARIANT_KINDS.map(async (kind) => {
      const assetId = stored[kind]?.assetId;
      if (typeof assetId !== "string" || !assetId) return null;
      const resolved = await resolveOneVariant(supabase, tenantId, assetId);
      return resolved ? ([kind, resolved] as const) : null;
    })
  );

  const bundle: LogoVariantBundle = {};
  for (const entry of entries) {
    if (entry) bundle[entry[0]] = entry[1];
  }
  return Object.keys(bundle).length > 0 ? bundle : null;
}
