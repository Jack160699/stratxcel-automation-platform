/**
 * Review Bot durable cycle — the missing piece between the real, tested
 * decision layer (planReviewResponses) and a live trigger
 * (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 12).
 *
 * Deliberately hosted as a plain function called from the existing
 * /api/internal/search/scheduler cron (see that route), not a new cron and
 * not a new Hermes/queue_jobs job type — that route is already a bearer-
 * secret-authenticated Vercel cron running outside the queue_jobs/Hermes
 * job-ownership matrix entirely (docs/architecture/JOB_OWNERSHIP_MATRIX.md
 * governs queue_jobs job types; this was never one), so adding a review
 * cycle here extends zero contracts and needs zero new cron slots.
 *
 * All provider calls (list/reply) are injected — this function makes no
 * network call of its own and is fully testable with a fake DB and fake
 * provider functions, matching runContinuousGrowthLoop's own
 * dependency-injection shape in packages/search-discovery.
 */
import { planReviewResponses } from "./google-growth-engine.ts";
import { isResolvedGbpLocationResourceName } from "../social/providers/google-business.ts";
import type { GoogleBusinessRawReview } from "../social/providers/google-business.ts";

const MAX_REPLY_ATTEMPTS = 3;

export interface ReviewBotCycleDeps {
  db: { from(table: string): any };
  listReviews: (accessToken: string, locationResourceName: string) => Promise<GoogleBusinessRawReview[]>;
  replyToReview: (accessToken: string, reviewId: string, comment: string) => Promise<void>;
}

export interface ReviewBotCycleInput {
  tenantId: string;
  socialAccountId: string;
  locationResourceName: string;
  accessToken: string;
  businessName: string;
}

export interface ReviewBotCycleResult {
  status: "COMPLETED" | "SKIPPED_UNRESOLVED_LOCATION";
  discovered: number;
  autoReplied: number;
  escalated: number;
  alreadyProcessed: number;
  failed: number;
  errors: Array<{ reviewId: string; error: string }>;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "23505" || /duplicate key|unique constraint/i.test(e?.message || "");
}

/**
 * Runs one tenant's review-bot cycle end to end: fetch → plan → idempotent
 * claim → reply where safe → persist the true outcome. Never replies twice
 * to the same review (the DB's own unique constraint on
 * (tenant_id, provider, review_id) is the real boundary — this function's
 * own pre-check is an optimization, not the guarantee) and never auto-
 * replies to an escalated review.
 */
export async function runReviewBotCycle(deps: ReviewBotCycleDeps, input: ReviewBotCycleInput): Promise<ReviewBotCycleResult> {
  // Caller (the scheduler route) is expected to have already checked the
  // real connection state via canonical-status.ts, but this function does
  // not trust that — a location that isn't a real resolved resource must
  // never reach the network call below, matching gatherGoogleBusiness's
  // own defense-in-depth guard.
  if (!isResolvedGbpLocationResourceName(input.locationResourceName)) {
    return { status: "SKIPPED_UNRESOLVED_LOCATION", discovered: 0, autoReplied: 0, escalated: 0, alreadyProcessed: 0, failed: 0, errors: [] };
  }

  const rawReviews = await deps.listReviews(input.accessToken, input.locationResourceName);
  const plan = planReviewResponses(input.businessName, rawReviews);
  const rawById = new Map(rawReviews.map((r) => [r.reviewId, r]));

  let autoReplied = 0;
  let escalated = 0;
  let alreadyProcessed = 0;
  let failed = 0;
  const errors: Array<{ reviewId: string; error: string }> = [];
  const nowIso = () => new Date().toISOString();

  for (const item of plan) {
    const raw = rawById.get(item.reviewId);

    const existing = await deps.db
      .from("gbp_review_response_jobs")
      .select("id, status, attempt")
      .eq("tenant_id", input.tenantId)
      .eq("provider", "google_business")
      .eq("review_id", item.reviewId)
      .maybeSingle();

    if (existing.data && existing.data.status !== "FAILED") {
      if (existing.data.status === "ESCALATED") escalated++;
      else alreadyProcessed++; // REPLIED, PENDING, DISCOVERED, APPROVED_FOR_AUTO_REPLY
      continue;
    }

    const priorAttempts = existing.data?.attempt ?? 0;
    if (existing.data && priorAttempts >= MAX_REPLY_ATTEMPTS) {
      failed++; // permanently failed — bounded retry, never an infinite loop
      continue;
    }

    let jobId = existing.data?.id as string | undefined;
    if (!jobId) {
      const insertResult = await deps.db
        .from("gbp_review_response_jobs")
        .insert({
          tenant_id: input.tenantId,
          social_account_id: input.socialAccountId,
          location_resource_name: input.locationResourceName,
          provider: "google_business",
          review_id: item.reviewId,
          reviewer_name: item.reviewerName,
          star_rating: item.starRating,
          review_comment: item.comment,
          review_created_at: raw?.createTime || null,
          sentiment: item.sentiment,
          escalation_reasons: item.escalationReasons,
          decision: item.action,
          status: item.action === "SKIP_ALREADY_REPLIED" ? "REPLIED" : item.action === "ESCALATE" ? "ESCALATED" : "PENDING",
          generated_response: item.draftResponse,
          responded_at: item.action === "SKIP_ALREADY_REPLIED" ? nowIso() : null,
        })
        .select("id")
        .single();

      if (insertResult.error) {
        if (isUniqueViolation(insertResult.error)) {
          // A concurrent run claimed this review between our SELECT and
          // INSERT — a real, expected race outcome, not a failure. The DB
          // constraint (not this check) is what actually prevented a
          // double reply here.
          alreadyProcessed++;
          continue;
        }
        failed++;
        errors.push({ reviewId: item.reviewId, error: insertResult.error.message || "insert failed" });
        continue;
      }
      jobId = insertResult.data.id;
    }

    if (item.action === "SKIP_ALREADY_REPLIED") {
      alreadyProcessed++;
      continue;
    }
    if (item.action === "ESCALATE") {
      escalated++;
      continue;
    }

    // AUTO_REPLY: attempt the real reply, then persist the true outcome —
    // never mark REPLIED unless replyToReview genuinely resolved.
    try {
      await deps.replyToReview(input.accessToken, item.reviewId, item.draftResponse!);
      // Known, narrow, honestly-documented gap: if the reply above succeeds
      // but this status persist fails (a real but rare DB failure in the
      // instant after a successful network call), the row stays PENDING
      // and a later run would see a non-FAILED status and skip it as
      // already-processed — never re-replying, but also never correcting
      // its own record. This mirrors the same class of at-least-once/
      // external-side-effect gap present in this codebase's other
      // execute-then-persist flows (e.g. executeSearchAction); not solved
      // here rather than pretending a single-process function can make
      // two independent operations atomic.
      await deps.db
        .from("gbp_review_response_jobs")
        .update({ status: "REPLIED", responded_at: nowIso(), attempt: priorAttempts + 1, updated_at: nowIso() })
        .eq("id", jobId);
      autoReplied++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.db
        .from("gbp_review_response_jobs")
        .update({ status: "FAILED", attempt: priorAttempts + 1, last_error: message, updated_at: nowIso() })
        .eq("id", jobId);
      failed++;
      errors.push({ reviewId: item.reviewId, error: message });
    }
  }

  return { status: "COMPLETED", discovered: plan.length, autoReplied, escalated, alreadyProcessed, failed, errors };
}
