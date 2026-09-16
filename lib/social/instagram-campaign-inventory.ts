import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveCampaignItemStatus,
  parseCampaignItemSpec,
  summarizeCampaignItems,
  type CampaignJobFacts,
  type CampaignSummary,
  type DerivedCampaignItemStatus,
  type InstagramCampaignItemSpec,
} from "./instagram-campaign.ts";

export interface CampaignInventoryItem {
  variantId: string;
  spec: InstagramCampaignItemSpec;
  caption: string;
  hashtags: string[];
  status: DerivedCampaignItemStatus;
  thumbnailUrl: string | null;
}

export interface CampaignInventory {
  campaign: { id: string; name: string; landingPage: string | null; createdAt: string };
  account: { username: string; providerAccountId: string; status: string; tokenHealth: string } | null;
  summary: CampaignSummary;
  items: CampaignInventoryItem[];
}

/**
 * Every Instagram campaign attached to one tenant's content, with each item's
 * real status. Scoped entirely by tenantId: jobs count only when they belong
 * to one of this tenant's own social accounts, and thumbnails only come from
 * this tenant's own media assets. Callers must have verified access to the
 * tenant (membership or staff support) before calling.
 */
export async function loadTenantInstagramCampaigns(
  service: SupabaseClient,
  tenantId: string,
  options: { thumbnails?: boolean } = {}
): Promise<CampaignInventory[]> {
  const { data: masters, error: mErr } = await service
    .from("content_master")
    .select("id, title, campaign_id")
    .eq("tenant_id", tenantId)
    .not("campaign_id", "is", null);
  if (mErr) throw new Error(`Failed to load campaign content: ${mErr.message}`);
  if (!masters?.length) return [];

  const campaignIds = [...new Set(masters.map((m) => m.campaign_id as string))];
  const masterIds = masters.map((m) => m.id as string);

  const [{ data: campaigns, error: cErr }, { data: accounts, error: aErr }, { data: variants, error: vErr }] = await Promise.all([
    service.from("social_campaigns").select("id, name, landing_page, created_at").in("id", campaignIds),
    service.from("social_accounts").select("id, platform, username, provider_account_id, status, token_health").eq("tenant_id", tenantId),
    service.from("content_variants").select("id, master_id, caption, hashtags, creative_spec").in("master_id", masterIds).eq("platform", "instagram"),
  ]);
  if (cErr) throw new Error(`Failed to load campaigns: ${cErr.message}`);
  if (aErr) throw new Error(`Failed to load tenant accounts: ${aErr.message}`);
  if (vErr) throw new Error(`Failed to load campaign variants: ${vErr.message}`);

  const masterCampaign = new Map(masters.map((m) => [m.id as string, m.campaign_id as string]));
  const campaignVariants = (variants ?? [])
    .map((v) => ({ row: v, spec: parseCampaignItemSpec(v.creative_spec) }))
    .filter((v): v is { row: typeof v.row; spec: InstagramCampaignItemSpec } => v.spec !== null && masterCampaign.get(v.row.master_id as string) === v.spec.campaign_id);
  if (campaignVariants.length === 0) return [];

  const tenantAccountIds = (accounts ?? []).map((a) => a.id as string);
  const variantIds = campaignVariants.map((v) => v.row.id as string);

  const latestJobByVariant = new Map<string, CampaignJobFacts>();
  if (tenantAccountIds.length) {
    const { data: jobs, error: jErr } = await service
      .from("social_publishing_jobs")
      .select("variant_id, account_id, status, scheduled_at, completed_at, last_error, result, created_at")
      .in("variant_id", variantIds)
      .in("account_id", tenantAccountIds)
      .order("created_at", { ascending: false });
    if (jErr) throw new Error(`Failed to load campaign jobs: ${jErr.message}`);
    for (const job of jobs ?? []) {
      if (!latestJobByVariant.has(job.variant_id as string)) latestJobByVariant.set(job.variant_id as string, job as CampaignJobFacts);
    }
  }

  const thumbnailByAssetId = new Map<string, string>();
  if (options.thumbnails) {
    const assetIds = [...new Set(campaignVariants.map((v) => v.spec.asset_id))];
    const { data: assets } = await service
      .from("social_media_assets")
      .select("id, storage_bucket, storage_path")
      .eq("tenant_id", tenantId)
      .in("id", assetIds);
    await Promise.all(
      (assets ?? []).map(async (asset) => {
        const { data: signed } = await service.storage.from(asset.storage_bucket as string).createSignedUrl(asset.storage_path as string, 10 * 60);
        if (signed?.signedUrl) thumbnailByAssetId.set(asset.id as string, signed.signedUrl);
      })
    );
  }

  const instagram = (accounts ?? []).find((a) => a.platform === "instagram");

  return (campaigns ?? [])
    .map((campaign) => {
      const items = campaignVariants
        .filter((v) => v.spec.campaign_id === campaign.id)
        .sort((a, b) => a.spec.sequence - b.spec.sequence)
        .map((v) => ({
          variantId: v.row.id as string,
          spec: v.spec,
          caption: (v.row.caption as string) ?? "",
          hashtags: (v.row.hashtags as string[] | null) ?? [],
          status: deriveCampaignItemStatus(v.spec, latestJobByVariant.get(v.row.id as string) ?? null),
          thumbnailUrl: thumbnailByAssetId.get(v.spec.asset_id) ?? null,
        }));
      return {
        campaign: { id: campaign.id as string, name: campaign.name as string, landingPage: (campaign.landing_page as string | null) ?? null, createdAt: campaign.created_at as string },
        account: instagram
          ? { username: instagram.username as string, providerAccountId: instagram.provider_account_id as string, status: instagram.status as string, tokenHealth: instagram.token_health as string }
          : null,
        summary: summarizeCampaignItems(items.map((i) => i.status)),
        items,
      };
    })
    .filter((inventory) => inventory.items.length > 0);
}
