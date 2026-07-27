import crypto from "node:crypto";
import { createSupabaseServiceClient } from "../../supabase/service";
import type { OwnerContext } from "../db-context";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export interface PublishingJobRow {
  id: string;
  account_id: string;
  variant_id: string;
  idempotency_key: string;
  status: string; // 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'PUBLISHED' | 'FAILED' | 'CANCELLED'
  scheduled_at: string;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  last_error: string | null;
  result: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
}

/**
 * social_publishing_jobs has a SELECT-only admin policy in the stratxcel
 * schema — by design, only a service-role process may INSERT/UPDATE it.
 * "Scheduling a post" is user-initiated in the UI but always executes this
 * insert server-side (Server Action), so using the service client here does
 * not weaken anything an anon/browser client could otherwise reach.
 */
export async function scheduleJob(
  service: ServiceClient,
  input: { accountId: string; variantId: string; scheduledAt: string }
): Promise<string> {
  const idempotencyKey = crypto.randomUUID();
  const { data, error } = await service
    .from("social_publishing_jobs")
    .insert({
      account_id: input.accountId,
      variant_id: input.variantId,
      idempotency_key: idempotencyKey,
      scheduled_at: input.scheduledAt,
      status: "SCHEDULED",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "publishing job insert failed");

  await service.from("content_variants").update({ scheduled_at: input.scheduledAt, status: "SCHEDULED" }).eq("id", input.variantId);
  return data.id as string;
}

export async function cancelJob(service: ServiceClient, id: string) {
  await service.from("social_publishing_jobs").update({ status: "CANCELLED" }).eq("id", id).eq("status", "SCHEDULED");
}

export async function listJobs(ctx: OwnerContext, limit = 50): Promise<PublishingJobRow[]> {
  const { data } = await ctx.supabase.from("social_publishing_jobs").select("*").order("scheduled_at", { ascending: false }).limit(limit);
  return (data ?? []) as PublishingJobRow[];
}

export async function listJobsService(service: ServiceClient, limit = 50): Promise<PublishingJobRow[]> {
  const { data } = await service.from("social_publishing_jobs").select("*").order("scheduled_at", { ascending: false }).limit(limit);
  return (data ?? []) as PublishingJobRow[];
}

export async function claimDueJobs(service: ServiceClient, batchSize: number) {
  const { data: candidates } = await service
    .from("social_publishing_jobs")
    .select("id")
    .eq("status", "SCHEDULED")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(batchSize);
  return candidates ?? [];
}

export async function tryClaimJob(service: ServiceClient, jobId: string, workerId: string) {
  const { data } = await service
    .from("social_publishing_jobs")
    .update({ status: "CLAIMED", locked_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "SCHEDULED")
    .select("id, account_id, variant_id, attempts, max_attempts, idempotency_key")
    .maybeSingle();
  return data as { id: string; account_id: string; variant_id: string; attempts: number; max_attempts: number; idempotency_key: string } | null;
}

export async function markJobRunning(service: ServiceClient, jobId: string) {
  await service.from("social_publishing_jobs").update({ status: "RUNNING" }).eq("id", jobId);
}

export async function markJobPublished(service: ServiceClient, jobId: string, result: Record<string, unknown>) {
  await service
    .from("social_publishing_jobs")
    .update({ status: "PUBLISHED", result, completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function markJobRetry(service: ServiceClient, jobId: string, attempts: number, lastError: string) {
  await service.from("social_publishing_jobs").update({ status: "SCHEDULED", attempts, last_error: lastError }).eq("id", jobId);
}

export async function moveJobToDeadLetter(service: ServiceClient, jobId: string, payload: Record<string, unknown>, error: string) {
  await service.from("social_publishing_jobs").update({ status: "FAILED", last_error: error, completed_at: new Date().toISOString() }).eq("id", jobId);
  await service.from("social_dead_letters").insert({ job_id: jobId, payload, error });
}

export async function listDeadLetters(ctx: OwnerContext, limit = 30) {
  const { data } = await ctx.supabase.from("social_dead_letters").select("*").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}
