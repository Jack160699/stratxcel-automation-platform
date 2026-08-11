/**
 * Business Growth Plan social subplan → Package Autopilot planned units.
 * Do not recompute random content pillars — preserve purchased composition.
 */

export interface GrowthSocialSubPlanLike {
  allocation: {
    images: number;
    reels: number;
    carousels: number;
    stories: number;
    totalUnits: number;
  };
  connectedChannels: readonly string[];
  channelStatus: "CONNECTED" | "NO_CONNECTED_CHANNEL" | "SETUP_REQUIRED";
  plannedUnits: readonly {
    id: string;
    deliverableKind: string;
    objective: string;
    details?: { mediaType?: string; platform?: string; contentObjective?: string };
    scheduledAtIso?: string | null;
  }[];
}

export interface PackageAutopilotUnitPlan {
  unitIndex: number;
  mediaType: string;
  platform: string | null;
  objective: string;
  scheduledAtIso: string | null;
  sourcePlannedUnitId: string;
}

export class PackagePlanIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackagePlanIntegrationError";
  }
}

/**
 * Feed Package Autopilot from the social subplan's planned units.
 * Strategy already decided WHAT units do — worker executes those units.
 */
export function socialSubPlanToPackageUnits(
  subplan: GrowthSocialSubPlanLike,
  purchasedComposition: ReadonlyArray<{ mediaType: string; quantity: number }>,
): PackageAutopilotUnitPlan[] {
  if (
    (subplan.channelStatus === "NO_CONNECTED_CHANNEL" || subplan.channelStatus === "SETUP_REQUIRED") &&
    !subplan.connectedChannels.length
  ) {
    throw new PackagePlanIntegrationError("no_connected_channel");
  }

  const purchasedTotal = purchasedComposition.reduce((sum, item) => sum + item.quantity, 0);
  if (purchasedTotal > 0 && subplan.allocation.totalUnits > purchasedTotal) {
    throw new PackagePlanIntegrationError("allocation_exceeds_purchased_composition");
  }

  if (subplan.plannedUnits.length > 0) {
    return subplan.plannedUnits.map((unit, index) => {
      const mediaType = unit.details?.mediaType ?? inferMediaType(unit.deliverableKind) ?? "image";
      const platform =
        unit.details?.platform ??
        (subplan.connectedChannels[0] ? subplan.connectedChannels[0].toLowerCase() : null);
      return {
        unitIndex: index,
        mediaType,
        platform,
        objective: unit.details?.contentObjective ?? unit.objective,
        scheduledAtIso: unit.scheduledAtIso ?? null,
        sourcePlannedUnitId: unit.id,
      };
    });
  }

  const units: PackageAutopilotUnitPlan[] = [];
  let index = 0;
  for (const item of purchasedComposition) {
    for (let i = 0; i < item.quantity; i += 1) {
      units.push({
        unitIndex: index,
        mediaType: item.mediaType,
        platform: subplan.connectedChannels[0]?.toLowerCase() ?? null,
        objective: `Execute purchased ${item.mediaType} unit`,
        scheduledAtIso: null,
        sourcePlannedUnitId: `composition:${item.mediaType}:${i}`,
      });
      index += 1;
    }
  }
  return units;
}

function inferMediaType(deliverableKind: string): string | null {
  const k = deliverableKind.toLowerCase();
  if (k.includes("reel") || k.includes("video")) return "reel";
  if (k.includes("carousel")) return "carousel";
  if (k.includes("story")) return "image";
  if (k.includes("image") || k.includes("post")) return "image";
  return null;
}
