import { createSupabaseServiceClient } from "../supabase/service.ts";
import { getValidProviderAccessToken, runScheduledJob } from "./worker.ts";
import { fetchInstagramMedia, fetchInstagramPublishingLimit, listRecentInstagramMedia } from "./providers/instagram.ts";
import { recordAudit } from "./repositories/system.ts";
import { publishNextCampaignItem, type CampaignPublishStep } from "./instagram-campaign-publisher.ts";
import { loadTenantBusinessContact } from "./business-contact.ts";

/** Production wiring for paced campaign publishing: real tokens, real Instagram calls, real worker. */
export async function publishNextCampaignItemInProduction(input: { tenantId: string; campaignId: string; actorUserId: string | null }): Promise<CampaignPublishStep> {
  const service = createSupabaseServiceClient();
  return publishNextCampaignItem(service as unknown as Parameters<typeof publishNextCampaignItem>[0], input, {
    loadContact: (tenantId) => loadTenantBusinessContact(service as unknown as Parameters<typeof loadTenantBusinessContact>[0], tenantId),
    getAccessToken: async (account) => (await getValidProviderAccessToken(service, account)).accessToken,
    fetchPublishingLimit: fetchInstagramPublishingLimit,
    listRecentMedia: (accessToken, igUserId) => listRecentInstagramMedia(accessToken, igUserId, 50),
    fetchMedia: fetchInstagramMedia,
    runJob: runScheduledJob,
    audit: (entry) =>
      recordAudit({
        actorType: entry.actorId ? "USER" : "SYSTEM",
        actorId: entry.actorId,
        action: entry.action,
        targetType: "social_publishing_job",
        targetId: entry.targetId,
        summary: entry.summary,
        meta: entry.meta,
      }).catch(() => {}),
    now: () => new Date(),
  });
}
