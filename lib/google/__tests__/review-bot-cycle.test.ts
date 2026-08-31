// Run with: node --experimental-strip-types lib/google/__tests__/review-bot-cycle.test.ts
import assert from "node:assert/strict";
import { runReviewBotCycle, type ReviewBotCycleDeps } from "../review-bot-cycle.ts";
import type { GoogleBusinessRawReview } from "../../social/providers/google-business.ts";

interface FakeRow {
  id: string;
  tenant_id: string;
  provider: string;
  review_id: string;
  status: string;
  attempt: number;
  [key: string]: unknown;
}

function makeFakeDb() {
  const rows: FakeRow[] = [];
  let nextId = 1;
  const db = {
    from(table: string) {
      assert.equal(table, "gbp_review_response_jobs");
      const chain: any = {
        _filters: {} as Record<string, string>,
        select() {
          return this;
        },
        eq(col: string, val: string) {
          this._filters[col] = val;
          return this;
        },
        async maybeSingle() {
          const match = rows.find((r) => r.tenant_id === this._filters.tenant_id && r.provider === this._filters.provider && r.review_id === this._filters.review_id);
          return { data: match ?? null, error: null };
        },
        insert(payload: Record<string, unknown>) {
          return {
            select() {
              return this;
            },
            async single() {
              // Real DB uniqueness boundary, simulated: a concurrent/retried
              // insert for the same (tenant, provider, review) must fail,
              // not silently create a duplicate row.
              const dup = rows.find(
                (r) => r.tenant_id === payload.tenant_id && r.provider === payload.provider && r.review_id === payload.review_id,
              );
              if (dup) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
              const row: FakeRow = { id: `job_${nextId++}`, attempt: 0, ...payload } as FakeRow;
              rows.push(row);
              return { data: { id: row.id }, error: null };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            async eq(col: string, val: string) {
              const row = rows.find((r) => (r as any)[col] === val);
              if (row) Object.assign(row, patch);
              return { data: row ?? null, error: null };
            },
          };
        },
      };
      return chain;
    },
  };
  return { db, rows };
}

function fakeListReviews(reviews: GoogleBusinessRawReview[]) {
  return async () => reviews;
}

async function run() {
  const baseInput = {
    tenantId: "tenant-1",
    socialAccountId: "acct-1",
    locationResourceName: "accounts/1/locations/2",
    accessToken: "token",
    businessName: "Sharma Electronics",
  };

  // --- 1. Unresolved location: never calls the network, never persists. --
  {
    const { db, rows } = makeFakeDb();
    let listCalled = false;
    const deps: ReviewBotCycleDeps = {
      db,
      listReviews: async () => { listCalled = true; return []; },
      replyToReview: async () => {},
    };
    const result = await runReviewBotCycle(deps, { ...baseInput, locationResourceName: "118157607743139723110" });
    assert.equal(result.status, "SKIPPED_UNRESOLVED_LOCATION");
    assert.equal(listCalled, false, "an unresolved location must never reach the network");
    assert.equal(rows.length, 0);
    console.log("✓ 1. Unresolved GBP location never fetches or persists anything");
  }

  // --- 2. New positive/neutral/negative reviews: auto-reply, exactly once each. ---
  {
    const { db, rows } = makeFakeDb();
    const replied: Array<{ reviewId: string; comment: string }> = [];
    const reviews: GoogleBusinessRawReview[] = [
      { reviewId: "r_pos", reviewerName: "Amit", starRating: 5, comment: "Great!", createTime: "2026-08-01T00:00:00Z", hasExistingReply: false },
      { reviewId: "r_neu", reviewerName: "Priya", starRating: 3, comment: "Okay experience.", createTime: "2026-08-02T00:00:00Z", hasExistingReply: false },
      { reviewId: "r_neg", reviewerName: "Ravi", starRating: 2, comment: "Service was slow.", createTime: "2026-08-03T00:00:00Z", hasExistingReply: false },
    ];
    const deps: ReviewBotCycleDeps = {
      db,
      listReviews: fakeListReviews(reviews),
      replyToReview: async (_token, reviewId, comment) => { replied.push({ reviewId, comment }); },
    };
    const result = await runReviewBotCycle(deps, baseInput);
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.autoReplied, 3);
    assert.equal(result.escalated, 0);
    assert.equal(replied.length, 3);
    assert.equal(rows.filter((r) => r.status === "REPLIED").length, 3);
    console.log("✓ 2. New positive/neutral/negative (non-sensitive) reviews are each auto-replied exactly once");
  }

  // --- 3. Escalated review: never calls replyToReview, never auto-publishes. ---
  {
    const { db, rows } = makeFakeDb();
    let replyCalled = false;
    const reviews: GoogleBusinessRawReview[] = [
      { reviewId: "r_legal", reviewerName: "Angry", starRating: 1, comment: "This is fraud, calling my lawyer.", createTime: "2026-08-01T00:00:00Z", hasExistingReply: false },
    ];
    const deps: ReviewBotCycleDeps = {
      db,
      listReviews: fakeListReviews(reviews),
      replyToReview: async () => { replyCalled = true; },
    };
    const result = await runReviewBotCycle(deps, baseInput);
    assert.equal(result.escalated, 1);
    assert.equal(replyCalled, false, "an escalated review must never be auto-replied");
    assert.equal(rows[0].status, "ESCALATED");
    assert.equal(rows[0].generated_response, null);
    console.log("✓ 3. Escalated reviews are never auto-published and are persisted as ESCALATED");
  }

  // --- 4. Duplicate/already-processed review: never replies twice. --------
  {
    const { db } = makeFakeDb();
    const replied: string[] = [];
    const reviews: GoogleBusinessRawReview[] = [
      { reviewId: "r_dup", reviewerName: "Amit", starRating: 5, comment: "Great!", createTime: "2026-08-01T00:00:00Z", hasExistingReply: false },
    ];
    const deps: ReviewBotCycleDeps = {
      db,
      listReviews: fakeListReviews(reviews),
      replyToReview: async (_t, id) => { replied.push(id); },
    };
    const first = await runReviewBotCycle(deps, baseInput);
    assert.equal(first.autoReplied, 1);
    // Simulates the exact scenario the brief calls "scheduler duplicate" —
    // the same review, already REPLIED, seen again on the next scheduled run.
    const second = await runReviewBotCycle(deps, baseInput);
    assert.equal(second.autoReplied, 0);
    assert.equal(second.alreadyProcessed, 1);
    assert.equal(replied.length, 1, "a review already replied to must never be replied to again on a later run");
    console.log("✓ 4. A review already processed on a prior run is never re-replied (scheduler duplicate case)");
  }

  // --- 5. Provider failure (timeout/429/5xx) then a later successful retry. ---
  {
    const { db, rows } = makeFakeDb();
    let attempt = 0;
    const reviews: GoogleBusinessRawReview[] = [
      { reviewId: "r_retry", reviewerName: "Amit", starRating: 5, comment: "Great!", createTime: "2026-08-01T00:00:00Z", hasExistingReply: false },
    ];
    const deps: ReviewBotCycleDeps = {
      db,
      listReviews: fakeListReviews(reviews),
      replyToReview: async () => {
        attempt++;
        if (attempt === 1) throw new Error("Google Business review reply failed (429): rate limited");
        // second attempt (the "worker retry" case) succeeds.
      },
    };
    const firstRun = await runReviewBotCycle(deps, baseInput);
    assert.equal(firstRun.failed, 1);
    assert.equal(rows[0].status, "FAILED");
    assert.equal(rows[0].attempt, 1);
    assert.match(rows[0].last_error as string, /429/);

    const secondRun = await runReviewBotCycle(deps, baseInput);
    assert.equal(secondRun.autoReplied, 1, "a FAILED job must be retried on the next run, not skipped as already-processed");
    assert.equal(rows[0].status, "REPLIED");
    assert.equal(rows[0].attempt, 2);
    console.log("✓ 5. A provider failure (429/5xx/timeout) persists FAILED and is retried on the next run, never re-inserted as a duplicate");
  }

  // --- 6. A permanently-failing review stops retrying after the bound. ----
  {
    const { db, rows } = makeFakeDb();
    const reviews: GoogleBusinessRawReview[] = [
      { reviewId: "r_perm_fail", reviewerName: "Amit", starRating: 5, comment: "Great!", createTime: "2026-08-01T00:00:00Z", hasExistingReply: false },
    ];
    const deps: ReviewBotCycleDeps = {
      db,
      listReviews: fakeListReviews(reviews),
      replyToReview: async () => { throw new Error("Google Business review reply failed (500): server error"); },
    };
    let lastResult;
    for (let i = 0; i < 5; i++) lastResult = await runReviewBotCycle(deps, baseInput);
    assert.equal(rows[0].attempt, 3, "must stop incrementing attempts past the bound — no infinite retry loop");
    assert.equal(lastResult!.failed, 1);
    console.log("✓ 6. Retries are bounded — a permanently-failing review does not retry forever");
  }

  // --- 7. Review with no resource name is already filtered upstream by ----
  // listLocationReviews itself (see google-business-reviews.test.ts); this
  // layer's plan is always built from reviews that already have real ids,
  // so no additional case is needed here for that.

  console.log("\nALL REVIEW BOT CYCLE TESTS PASSED");
}

run().catch((err) => {
  console.error("review-bot-cycle test failed:", err);
  process.exit(1);
});
