import type { ReferenceAsset } from "../types.ts";

export interface SelectReferenceAssetsArgs {
  tenantId: string;
  missionId: string;
  campaignId?: string;
  library: readonly ReferenceAsset[];
  explicitIds?: readonly string[];
}

/**
 * Selection priority: mission → campaign → brandBrain.
 * Never auto-selects unrelated assets. Cross-tenant assets throw.
 */
export function selectReferenceAssets(args: SelectReferenceAssetsArgs): ReferenceAsset[] {
  for (const asset of args.library) {
    if (asset.tenantId !== args.tenantId) {
      throw new Error(`cross_tenant_reference_forbidden:${asset.id}`);
    }
  }

  const byId = new Map(args.library.map((a) => [a.id, a]));
  const selected: ReferenceAsset[] = [];
  const seen = new Set<string>();

  const push = (asset: ReferenceAsset | undefined) => {
    if (!asset || seen.has(asset.id)) return;
    seen.add(asset.id);
    selected.push(asset);
  };

  for (const id of args.explicitIds ?? []) push(byId.get(id));
  for (const asset of args.library) {
    if (asset.missionId === args.missionId) push(asset);
  }
  if (args.campaignId) {
    for (const asset of args.library) {
      if (asset.campaignId === args.campaignId) push(asset);
    }
  }
  if (selected.length === 0) {
    for (const asset of args.library) {
      if (asset.brandBrainRef) push(asset);
    }
  }
  return selected;
}
