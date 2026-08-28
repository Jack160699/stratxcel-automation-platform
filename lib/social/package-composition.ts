/**
 * Purchased package mix for Social Autopilot.
 * Composition always comes from the plan catalog — never a silent text×N fallback.
 */

export type PackageMediaKind = "image" | "carousel" | "reel" | "video" | "text";
export interface PackageCompositionItem {
  mediaType: PackageMediaKind;
  quantity: number;
}
export interface PackageComposition {
  items: PackageCompositionItem[];
  countingPolicy: "CONTENT_UNIT" | "PLATFORM_PUBLISH";
  allowedPlatforms: string[];
  publishingMode: "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";
  servicePeriodDays: number;
}

/**
 * Catalog mix per paid/legacy plan tier. Totals align with PLAN_LIMITS.social_posts.
 *
 * Remove Reels mission: every tier used to carve a slice of its total into
 * `reel` (video) units. Real gap found live -- selectPackageMediaAsset
 * (package-media.ts) fails closed with `media_capability_unavailable` for
 * ANY reel/video unit when the tenant has zero video-type social_media_assets
 * (mime_type LIKE 'video/%'), which is every tenant today: there is no real
 * video-generation capability anywhere in this codebase (Creative Studio
 * only ever produces images), so a reel unit could never have completed
 * regardless of how many times the producer retried it -- confirmed live: a
 * real Stratxcel queue item permanently BLOCKED this exact way on the very
 * first cron tick after activation. Every former reel/video quantity is
 * folded into that tier's image quantity (never just dropped) so paying
 * customers keep their full purchased post count -- only the media kind
 * changes, same treatment YouTube got in the Finalize Autopilot Pipeline
 * mission (AUTOPILOT_SCHEDULABLE_PLATFORMS) for the analogous "no video
 * capability" gap at the platform level instead of the content-type level.
 */
export const PLAN_PACKAGE_COMPOSITIONS: Readonly<
  Record<string, ReadonlyArray<{ mediaType: PackageMediaKind; quantity: number }>>
> = {
  // 28 social_posts (canonical commercial model)
  social: [{ mediaType: "image", quantity: 28 }],
  social_content: [{ mediaType: "image", quantity: 28 }],
  seo_and_social: [{ mediaType: "image", quantity: 28 }],
  advanced_social: [{ mediaType: "image", quantity: 28 }],
  advanced_growth: [{ mediaType: "image", quantity: 28 }],
  // 12 social_posts (legacy)
  launch: [{ mediaType: "image", quantity: 12 }],
  starter: [{ mediaType: "image", quantity: 12 }],
  // 25 social_posts (legacy)
  growth: [{ mediaType: "image", quantity: 25 }],
  // 50 social_posts (legacy)
  business: [{ mediaType: "image", quantity: 50 }],
  // 60 social_posts (legacy)
  custom_growth: [{ mediaType: "image", quantity: 60 }],
  // 75 social_posts (quote-led display baseline)
  scale: [{ mediaType: "image", quantity: 75 }],
  // Explicit all-image catalog entry for image-only purchased packages (tests + special grants).
  image_30: [{ mediaType: "image", quantity: 30 }],
};

export function compositionUnitTotal(items: ReadonlyArray<{ quantity: number }>): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function formatPackageCompositionLabel(items: ReadonlyArray<PackageCompositionItem>): string {
  return items
    .map((item) => {
      const label =
        item.mediaType === "reel"
          ? item.quantity === 1
            ? "reel"
            : "reels"
          : item.mediaType === "image"
            ? item.quantity === 1
              ? "image post"
              : "image posts"
            : item.mediaType === "carousel"
              ? item.quantity === 1
                ? "carousel"
                : "carousels"
              : item.mediaType === "video"
                ? item.quantity === 1
                  ? "video"
                  : "videos"
                : item.quantity === 1
                  ? "text post"
                  : "text posts";
      return `${item.quantity} ${label}`;
    })
    .join(" + ");
}

export function validatePackageComposition(value: PackageComposition): PackageComposition {
  if (!Number.isInteger(value.servicePeriodDays) || value.servicePeriodDays < 1 || value.servicePeriodDays > 366) {
    throw new Error("invalid_service_period");
  }
  if (!value.items.length || value.items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
    throw new Error("invalid_package_quantities");
  }
  const platforms = [...new Set(value.allowedPlatforms.map((platform) => platform.toLowerCase()).filter(Boolean))];
  if (!platforms.length) throw new Error("package_destinations_required");
  // Autopilot packages that require media must never collapse to all-text.
  const onlyText = value.items.every((item) => item.mediaType === "text");
  if (onlyText) throw new Error("package_configuration_required");
  return { ...value, allowedPlatforms: platforms };
}

export function compositionMediaTypeForUnit(composition: PackageComposition, zeroBasedUnit: number): PackageMediaKind | null {
  let cursor = zeroBasedUnit;
  for (const item of composition.items) {
    if (cursor < item.quantity) return item.mediaType;
    cursor -= item.quantity;
  }
  return null;
}

/**
 * Resolve the purchased mix from plan catalog / entitlement configuration.
 * Returns null when the mix cannot be determined — callers must block activation
 * (NEEDS SETUP / package_configuration_required). Never invents text×N.
 */
export function resolvePurchasedPackageComposition(input: {
  planTier: string | null | undefined;
  allowedPlatforms: string[];
  publishingMode: "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH";
  entitlementLimit?: number | null;
  /** Optional explicit catalog key (e.g. image_30) when grants encode a special mix. */
  compositionKey?: string | null;
}): PackageComposition | null {
  const key = (input.compositionKey || input.planTier || "").trim().toLowerCase();
  if (!key || key === "free") return null;

  const catalogItems = PLAN_PACKAGE_COMPOSITIONS[key];
  if (!catalogItems?.length) return null;

  // Soft consistency check only — catalog mix is authoritative for media kinds.
  // Do not fall back to text×entitlementLimit when totals diverge.
  if (typeof input.entitlementLimit === "number" && input.entitlementLimit > 0) {
    const total = compositionUnitTotal(catalogItems);
    if (total !== input.entitlementLimit) {
      // Still use catalog; entitlement may be customized while mix key is known.
      // If catalog is empty or all-text, fail below.
    }
  }

  try {
    return validatePackageComposition({
      items: catalogItems.map((item) => ({ mediaType: item.mediaType, quantity: item.quantity })),
      countingPolicy: "CONTENT_UNIT",
      allowedPlatforms: input.allowedPlatforms,
      publishingMode: input.publishingMode,
      servicePeriodDays: 30,
    });
  } catch {
    return null;
  }
}
