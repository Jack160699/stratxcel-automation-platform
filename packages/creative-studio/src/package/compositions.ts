import type { PackageTier, StudioPackageComposition } from "../types.ts";

const COMPOSITIONS: Record<PackageTier, StudioPackageComposition> = {
  starter: {
    tier: "starter",
    items: [
      { mediaType: "image", quantity: 8 },
      { mediaType: "reel", quantity: 4 },
    ],
    totalUnits: 12,
  },
  launch: {
    tier: "launch",
    items: [
      { mediaType: "image", quantity: 8 },
      { mediaType: "reel", quantity: 4 },
    ],
    totalUnits: 12,
  },
  growth: {
    tier: "growth",
    items: [
      { mediaType: "image", quantity: 20 },
      { mediaType: "reel", quantity: 5 },
    ],
    totalUnits: 25,
  },
  business: {
    tier: "business",
    items: [
      { mediaType: "image", quantity: 40 },
      { mediaType: "reel", quantity: 10 },
    ],
    totalUnits: 50,
  },
  image_30: {
    tier: "image_30",
    items: [{ mediaType: "image", quantity: 30 }],
    totalUnits: 30,
  },
};

export function getPackageComposition(tier: PackageTier): StudioPackageComposition {
  const composition = COMPOSITIONS[tier];
  if (!composition) throw new Error(`unknown_package_tier:${tier}`);
  return {
    tier: composition.tier,
    items: composition.items.map((item) => ({ ...item })),
    totalUnits: composition.totalUnits,
  };
}

export function assertPackageCompositionPreserved(
  expected: StudioPackageComposition,
  actual: StudioPackageComposition,
): void {
  if (expected.tier !== actual.tier) throw new Error("package_composition_tier_mismatch");
  if (expected.totalUnits !== actual.totalUnits) throw new Error("package_composition_total_mismatch");
  if (expected.items.length !== actual.items.length) {
    throw new Error("package_composition_items_length_mismatch");
  }
  for (let i = 0; i < expected.items.length; i++) {
    const e = expected.items[i]!;
    const a = actual.items[i]!;
    if (e.mediaType !== a.mediaType || e.quantity !== a.quantity) {
      throw new Error(`package_composition_item_mismatch:${i}`);
    }
  }
  if (actual.items.every((item) => (item as { mediaType: string }).mediaType === "text")) {
    throw new Error("package_composition_collapsed_to_text");
  }
}

export const PACKAGE_COMPOSITIONS = COMPOSITIONS;
