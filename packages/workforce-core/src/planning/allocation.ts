import type {
  AllocationPolicy,
  BusinessGrowthEntitlementSnapshot,
  ContractSnapshotInput,
  EntitlementSnapshot,
  PackageCompositionItem,
  SocialAllocation,
} from "./types.ts";
import { AllocationPolicyError } from "./types.ts";

const PACKAGE_PRESETS: Record<string, readonly PackageCompositionItem[]> = {
  starter: [
    { mediaType: "image", quantity: 8 },
    { mediaType: "reel", quantity: 4 },
  ],
  growth: [
    { mediaType: "image", quantity: 20 },
    { mediaType: "reel", quantity: 5 },
  ],
  business: [
    { mediaType: "image", quantity: 40 },
    { mediaType: "reel", quantity: 10 },
  ],
  image_30: [{ mediaType: "image", quantity: 30 }],
};

export function snapshotFromContract(input: ContractSnapshotInput): BusinessGrowthEntitlementSnapshot {
  const usage = input.currentUsage ?? {};
  const remaining: Record<string, number> = {};
  for (const [k, limit] of Object.entries(input.relevantEntitlements)) {
    remaining[k] = Math.max(0, limit - (usage[k] ?? 0));
  }
  return {
    allocationPolicy: input.allocationPolicy,
    packageComposition: [...input.packageComposition],
    relevantEntitlements: { ...input.relevantEntitlements },
    currentUsage: { ...usage },
    remainingUsage: remaining,
    planTier: input.planTier,
    subscriptionId: input.subscriptionId ?? null,
    periodStartIso: input.periodStartIso,
    periodEndIso: input.periodEndIso,
    purchasedServiceKeys: input.purchasedServiceKeys,
  };
}

export function resolveAllocationPolicy(snapshot: EntitlementSnapshot): AllocationPolicy {
  if (snapshot.allocationPolicy === "UNKNOWN") return "UNKNOWN";
  if (snapshot.allocationPolicy) return snapshot.allocationPolicy;
  return "UNKNOWN";
}

function compositionToAllocation(composition: readonly PackageCompositionItem[]): SocialAllocation {
  let images = 0;
  let reels = 0;
  let carousels = 0;
  let stories = 0;
  for (const item of composition) {
    if (item.mediaType === "image") images += item.quantity;
    if (item.mediaType === "reel") reels += item.quantity;
    if (item.mediaType === "carousel") carousels += item.quantity;
    if (item.mediaType === "story") stories += item.quantity;
  }
  return {
    images,
    reels,
    carousels,
    stories,
    totalUnits: images + reels + carousels + stories,
  };
}

function detectPreset(composition: readonly PackageCompositionItem[]): string | null {
  const key = Object.entries(PACKAGE_PRESETS).find(([, preset]) =>
    preset.every((p) => composition.some((c) => c.mediaType === p.mediaType && c.quantity === p.quantity)) &&
    composition.length === preset.length,
  );
  return key?.[0] ?? null;
}

export function enforceSocialAllocation(
  snapshot: EntitlementSnapshot,
  proposed: Partial<SocialAllocation>,
): SocialAllocation {
  const policy = resolveAllocationPolicy(snapshot);
  if (policy === "UNKNOWN") {
    throw new AllocationPolicyError("allocation_policy_unknown");
  }

  const contractAllocation = compositionToAllocation(snapshot.packageComposition);

  if (policy === "FIXED_COMPOSITION" || policy === "MINIMUM_COMPOSITION" || policy === "CUSTOM_CONTRACT") {
    return {
      images: contractAllocation.images,
      reels: contractAllocation.reels,
      carousels: contractAllocation.carousels,
      stories: contractAllocation.stories,
      totalUnits: contractAllocation.totalUnits,
    };
  }

  if (policy === "FLEXIBLE_COMPOSITION") {
    const maxUnits =
      snapshot.relevantEntitlements.social_content_units ??
      snapshot.relevantEntitlements.social_posts ??
      contractAllocation.totalUnits;
    const proposedTotal =
      (proposed.images ?? 0) +
      (proposed.reels ?? 0) +
      (proposed.carousels ?? 0) +
      (proposed.stories ?? 0);
    if (proposedTotal > maxUnits) {
      throw new AllocationPolicyError("flexible_allocation_exceeds_entitlement");
    }
    if (proposedTotal === 0) {
      return { images: maxUnits, reels: 0, carousels: 0, stories: 0, totalUnits: maxUnits };
    }
    return {
      images: proposed.images ?? 0,
      reels: proposed.reels ?? 0,
      carousels: proposed.carousels ?? 0,
      stories: proposed.stories ?? 0,
      totalUnits: proposedTotal,
    };
  }

  throw new AllocationPolicyError(`unsupported_allocation_policy:${policy}`);
}

export function inferPackagePreset(snapshot: EntitlementSnapshot): string | null {
  return detectPreset(snapshot.packageComposition);
}

export { PACKAGE_PRESETS };
