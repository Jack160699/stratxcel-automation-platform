// Run with: node --experimental-strip-types lib/google/__tests__/google-growth-engine.test.ts
import assert from "node:assert/strict";
import { processCustomerReview, planReviewResponses } from "../google-growth-engine.ts";
import type { GoogleBusinessRawReview } from "../../social/providers/google-business.ts";

function run() {
  // --- processCustomerReview: sentiment from star rating alone. ----------
  const positive = processCustomerReview("Sharma Electronics", { reviewerName: "Amit", starRating: 4, comment: "Great service, quick fix." });
  assert.equal(positive.sentiment, "POSITIVE");
  assert.equal(positive.requiresEscalation, false);
  assert.ok(!positive.draftResponse.includes("5-star"), "a 4-star review must never be misdescribed as a 5-star review in the reply");
  assert.ok(positive.draftResponse.includes("Sharma Electronics"), "the real business name must appear, not a placeholder");

  const neutral = processCustomerReview("Sharma Electronics", { reviewerName: "Priya", starRating: 3, comment: "It was okay." });
  assert.equal(neutral.sentiment, "NEUTRAL");
  assert.equal(neutral.requiresEscalation, false);

  const negative = processCustomerReview("Sharma Electronics", { reviewerName: "Ravi", starRating: 1, comment: "Very slow service and rude staff." });
  assert.equal(negative.sentiment, "NEGATIVE");
  assert.equal(negative.requiresEscalation, false, "a negative review with no sensitive-topic keyword must not escalate");
  assert.ok(!negative.draftResponse.toLowerCase().includes("we fixed") , "must never invent a resolution that wasn't stated");

  // --- Escalation categories, per the brief's own list. -------------------
  const legal = processCustomerReview("X", { reviewerName: "A", starRating: 1, comment: "I am calling my lawyer, this is fraud." });
  assert.equal(legal.requiresEscalation, true);
  assert.deepEqual(legal.escalationReasons, ["legal"]);

  const medical = processCustomerReview("X", { reviewerName: "A", starRating: 2, comment: "My child had an allergic reaction to the food." });
  assert.equal(medical.requiresEscalation, true);
  assert.deepEqual(medical.escalationReasons, ["medical"]);

  const refund = processCustomerReview("X", { reviewerName: "A", starRating: 1, comment: "I want a refund, this was a billing dispute." });
  assert.equal(refund.requiresEscalation, true);
  assert.ok(refund.escalationReasons.includes("refund_dispute"));

  const threat = processCustomerReview("X", { reviewerName: "A", starRating: 1, comment: "Someone threatened me at the front desk." });
  assert.equal(threat.requiresEscalation, true);
  assert.ok(threat.escalationReasons.includes("threat"));

  // --- A positive review mentioning a sensitive word must NOT escalate. --
  const positiveWithSensitiveWord = processCustomerReview("X", {
    reviewerName: "A",
    starRating: 5,
    comment: "I have a severe allergy and the staff were incredibly careful — no issues at all, thank you!",
  });
  assert.equal(positiveWithSensitiveWord.requiresEscalation, false, "escalation is reserved for negative/neutral reviews, not any mention of a sensitive word");

  console.log("PASS: processCustomerReview classifies sentiment/escalation correctly and never fabricates a rating or resolution");

  // --- planReviewResponses: pure decision layer over raw reviews. --------
  const rawReviews: GoogleBusinessRawReview[] = [
    { reviewId: "r1", reviewerName: "Amit", starRating: 5, comment: "Excellent!", createTime: "2026-08-01T00:00:00Z", hasExistingReply: false },
    { reviewId: "r2", reviewerName: "Ravi", starRating: 1, comment: "This is fraud, calling my lawyer.", createTime: "2026-08-02T00:00:00Z", hasExistingReply: false },
    { reviewId: "r3", reviewerName: "Priya", starRating: 4, comment: "Good, already replied to.", createTime: "2026-08-03T00:00:00Z", hasExistingReply: true },
  ];
  const plan = planReviewResponses("Sharma Electronics", rawReviews);
  assert.equal(plan.length, 3);

  const r1 = plan.find((p) => p.reviewId === "r1")!;
  assert.equal(r1.action, "AUTO_REPLY");
  assert.ok(r1.draftResponse && r1.draftResponse.length > 0);

  const r2 = plan.find((p) => p.reviewId === "r2")!;
  assert.equal(r2.action, "ESCALATE", "a review raising a legal concern must never be auto-replied");
  assert.equal(r2.draftResponse, null, "an escalated review must never carry an auto-publishable draft");

  const r3 = plan.find((p) => p.reviewId === "r3")!;
  assert.equal(r3.action, "SKIP_ALREADY_REPLIED", "a review that already has a reply must never be re-replied");
  assert.equal(r3.draftResponse, null);
  assert.equal(r3.sentiment, "POSITIVE", "sentiment is still computed for an already-replied review, as a safe signal for downstream language mining — it just never becomes a publishable action");

  console.log("PASS: planReviewResponses never re-replies an already-answered review and never auto-publishes an escalated one");
}

run();
