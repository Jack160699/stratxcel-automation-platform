/**
 * Tenant-scoped publication status lookup for Hermes / Mission Control.
 * Never returns provider credentials.
 */

import type { SocialPublicationQueryResult } from "./types.ts";
import {
  queryPublicationStatusFromRecord,
  type PublicationStatusRecord,
} from "./publication-status.ts";

type MaybeSingleResult = Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;

type MinimalQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => MaybeSingleResult;
      };
    };
  };
};

/**
 * Resolve a publication reference (job id or package queue item id) for a tenant.
 * Fail closed to UNKNOWN when not found or cross-tenant.
 */
export async function lookupSocialPublicationStatus(
  client: MinimalQueryClient,
  tenantId: string,
  reference: string,
): Promise<SocialPublicationQueryResult> {
  if (!tenantId || !reference) {
    return queryPublicationStatusFromRecord(null);
  }

  const job = await client
    .from("social_publishing_jobs")
    .select("id, status, completed_at, result, account_id")
    .eq("id", reference)
    .maybeSingle();

  if (job.data) {
    const account = await client
      .from("social_accounts")
      .select("id, tenant_id")
      .eq("id", String(job.data.account_id))
      .maybeSingle();
    if (!account.data || String(account.data.tenant_id) !== tenantId) {
      return queryPublicationStatusFromRecord(null);
    }
    const result = (job.data.result ?? {}) as Record<string, unknown>;
    const record: PublicationStatusRecord = {
      reference,
      rawStatus: String(job.data.status),
      liveUrl: typeof result.permalink === "string" ? result.permalink : null,
      providerPublishId:
        typeof result.externalPostId === "string"
          ? result.externalPostId
          : typeof result.providerPublishId === "string"
            ? result.providerPublishId
            : null,
      publishedAtIso: typeof job.data.completed_at === "string" ? job.data.completed_at : null,
      scheduleJobId: String(job.data.id),
      shadow: result.mode === "shadow",
      resultMode: typeof result.mode === "string" ? result.mode : null,
    };
    return queryPublicationStatusFromRecord(record);
  }

  const queue = await client
    .from("social_package_queue_items")
    .select("id, status, tenant_id, publishing_job_id, result")
    .eq("id", reference)
    .maybeSingle();

  if (queue.data) {
    if (String(queue.data.tenant_id) !== tenantId) {
      return queryPublicationStatusFromRecord(null);
    }
    const result = (queue.data.result ?? {}) as Record<string, unknown>;
    const record: PublicationStatusRecord = {
      reference,
      rawStatus: String(queue.data.status),
      liveUrl: typeof result.permalink === "string" ? result.permalink : null,
      providerPublishId: typeof result.externalPostId === "string" ? result.externalPostId : null,
      publishedAtIso: typeof result.publishedAt === "string" ? result.publishedAt : null,
      scheduleJobId: queue.data.publishing_job_id ? String(queue.data.publishing_job_id) : null,
      shadow: String(queue.data.status).toUpperCase() === "SHADOW_COMPLETED" || result.mode === "shadow",
      resultMode: typeof result.mode === "string" ? result.mode : null,
    };
    return queryPublicationStatusFromRecord(record);
  }

  return queryPublicationStatusFromRecord(null);
}
