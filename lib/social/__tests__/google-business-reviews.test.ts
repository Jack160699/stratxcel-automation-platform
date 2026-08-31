// Real Reviews.list / Reviews.updateReply calls for the review-bot pipeline
// (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 10). Same
// pattern as google-business-publish-honesty.test.ts: runs the real module
// against a mocked fetch, so the actual request/response handling is
// exercised, not just types.
// Run with: node --experimental-strip-types lib/social/__tests__/google-business-reviews.test.ts
import assert from "node:assert/strict";
import { listLocationReviews, replyToLocationReview } from "../providers/google-business.ts";

async function run() {
  const originalFetch = globalThis.fetch;
  try {
    // --- listLocationReviews: real endpoint, real pagination, real mapping. ---
    let callCount = 0;
    globalThis.fetch = (async (url: string) => {
      callCount++;
      assert.ok(String(url).startsWith("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews"), "must call the real Reviews.list endpoint");
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            reviews: [
              { name: "accounts/1/locations/2/reviews/r1", reviewer: { displayName: "Amit" }, starRating: "FIVE", comment: "Great!", createTime: "2026-08-01T00:00:00Z" },
              { name: "accounts/1/locations/2/reviews/r2", reviewer: { displayName: "Ravi" }, starRating: "ONE", comment: "Bad.", createTime: "2026-08-02T00:00:00Z", reviewReply: { comment: "Sorry to hear that." } },
            ],
            nextPageToken: "page2",
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          reviews: [{ name: "accounts/1/locations/2/reviews/r3", reviewer: { displayName: "Priya" }, starRating: "THREE", comment: "Okay.", createTime: "2026-08-03T00:00:00Z" }],
        }),
      } as Response;
    }) as typeof fetch;

    const reviews = await listLocationReviews("test_token", "accounts/1/locations/2");
    assert.equal(callCount, 2, "must follow real pagination via nextPageToken");
    assert.equal(reviews.length, 3);
    assert.equal(reviews[0].starRating, 5, "the FIVE enum must map to the numeric 5, not be left as a string or fabricated");
    assert.equal(reviews[1].hasExistingReply, true, "a review with a real reviewReply.comment must report hasExistingReply true");
    assert.equal(reviews[0].hasExistingReply, false);
    assert.equal(reviews[2].reviewerName, "Priya");

    // A review with no resource name must be skipped, never given a fabricated id.
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ reviews: [{ reviewer: { displayName: "NoName" }, starRating: "FIVE", comment: "x" }] }),
    })) as unknown as typeof fetch;
    const skipped = await listLocationReviews("test_token", "accounts/1/locations/2");
    assert.equal(skipped.length, 0, "a review with no real resource name must be skipped, never fabricated a usable id");

    // A failed list call must throw a real, honest error.
    globalThis.fetch = (async () => ({ ok: false, status: 403, text: async () => "forbidden" })) as unknown as typeof fetch;
    await assert.rejects(() => listLocationReviews("test_token", "accounts/1/locations/2"), /Google Business reviews list failed \(403\)/);

    console.log("PASS: listLocationReviews calls the real endpoint, follows real pagination, and never fabricates a review id or reply state");

    // --- replyToLocationReview: real PUT, real honest error on failure. ----
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as typeof fetch;
    await replyToLocationReview("test_token", "accounts/1/locations/2/reviews/r1", "Thank you!");
    assert.equal(capturedUrl, "https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/r1/reply");
    assert.equal(capturedInit?.method, "PUT");
    assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, "Bearer test_token");
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { comment: "Thank you!" });

    globalThis.fetch = (async () => ({ ok: false, status: 429, text: async () => "rate limited" })) as unknown as typeof fetch;
    await assert.rejects(() => replyToLocationReview("test_token", "accounts/1/locations/2/reviews/r1", "x"), /Google Business review reply failed \(429\)/, "a failed reply must throw a real error, never a fabricated success");

    console.log("PASS: replyToLocationReview makes the real call and never fabricates success on failure");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run();
