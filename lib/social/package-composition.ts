export type PackageMediaKind = "image" | "carousel" | "reel" | "video" | "text";
export interface PackageCompositionItem { mediaType: PackageMediaKind; quantity: number }
export interface PackageComposition { items: PackageCompositionItem[]; countingPolicy: "CONTENT_UNIT" | "PLATFORM_PUBLISH"; allowedPlatforms: string[]; publishingMode: "AUTO_PUBLISH" | "REVIEW_BEFORE_PUBLISH"; servicePeriodDays: number }

export function validatePackageComposition(value: PackageComposition): PackageComposition {
  if (!Number.isInteger(value.servicePeriodDays) || value.servicePeriodDays < 1 || value.servicePeriodDays > 366) throw new Error("invalid_service_period");
  if (!value.items.length || value.items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) throw new Error("invalid_package_quantities");
  const platforms = [...new Set(value.allowedPlatforms.map((platform) => platform.toLowerCase()).filter(Boolean))];
  if (!platforms.length) throw new Error("package_destinations_required");
  return { ...value, allowedPlatforms: platforms };
}

export function compositionMediaTypeForUnit(composition: PackageComposition, zeroBasedUnit: number): PackageMediaKind | null {
  let cursor = zeroBasedUnit;
  for (const item of composition.items) { if (cursor < item.quantity) return item.mediaType; cursor -= item.quantity; }
  return null;
}
