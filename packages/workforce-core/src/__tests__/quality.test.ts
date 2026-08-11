// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/quality.test.ts
import assert from "node:assert/strict";
import { critiqueCandidate, decideFromScore } from "../quality/critic.ts";
import { createQualityLoop, runCritiqueCycle, submitCandidate, selectBestCandidate } from "../quality/loop.ts";
import { defaultQualityPolicy } from "../quality/types.ts";

function run() {
  assert.throws(
    () =>
      createQualityLoop({
        policy: defaultQualityPolicy,
        creatorDepartment: "content",
        creatorRole: "copywriter",
        criticDepartment: "content",
        criticRole: "copywriter",
      }),
    /creator_critic_must_differ/,
  );

  let loop = createQualityLoop({
    policy: defaultQualityPolicy,
    creatorDepartment: "content",
    creatorRole: "copywriter",
    criticDepartment: "quality",
    criticRole: "creative_critic",
  });

  loop = submitCandidate(loop, {
    id: "cand-1",
    kind: "caption_set",
    content: "First draft",
  });

  loop = runCritiqueCycle(loop, "cand-1", {
    scoreOverrides: { brand_fit: 60, clarity: 65 },
  });
  assert.equal(loop.critiques.at(-1)?.decision, "REVISE");
  assert.equal(loop.revisionCount, 1);

  loop = submitCandidate(loop, {
    id: "cand-2",
    kind: "caption_set",
    content: "Improved draft",
  });
  loop = runCritiqueCycle(loop, "cand-2", {
    scoreOverrides: { brand_fit: 90, clarity: 88, factuality: 85 },
  });
  assert.equal(loop.selectedFinalId, "cand-2");

  const finalArtifact = selectBestCandidate(loop);
  assert.ok(finalArtifact?.provenance);

  const factualityDecision = decideFromScore(defaultQualityPolicy, [
    { dimension: "brand_fit", score: 90 },
    { dimension: "clarity", score: 90 },
    { dimension: "factuality", score: 40 },
    { dimension: "originality", score: 95 },
  ]);
  assert.equal(factualityDecision, "REVISE");

  const brandFail = critiqueCandidate({
    candidate: {
      id: "cand-brand-fail",
      kind: "caption_set",
      createdByDepartment: "content",
      createdByRole: "copywriter",
      content: "Off-brand",
    },
    policy: defaultQualityPolicy,
    reviewerDepartment: "quality",
    reviewerRole: "creative_critic",
    scoreOverrides: { brand_fit: 50, clarity: 90 },
  });
  assert.equal(brandFail.decision, "REJECT");

  const evidenceFail = critiqueCandidate({
    candidate: {
      id: "cand-evidence",
      kind: "research_summary",
      createdByDepartment: "research",
      createdByRole: "market_researcher",
      content: "Claim without proof",
      evidenceIds: [],
    },
    policy: defaultQualityPolicy,
    reviewerDepartment: "compliance",
    reviewerRole: "claim_checker",
    missingEvidence: true,
  });
  assert.equal(evidenceFail.decision, "REJECT");

  let capped = createQualityLoop({
    policy: { ...defaultQualityPolicy, maxRevisionCount: 1 },
    creatorDepartment: "media",
    creatorRole: "image_producer",
    criticDepartment: "quality",
    criticRole: "visual_qa",
  });
  capped = submitCandidate(capped, { id: "c1", kind: "image_candidate", content: "v1" });
  capped = runCritiqueCycle(capped, "c1", { scoreOverrides: { brand_fit: 60, clarity: 65 } });
  capped = submitCandidate(capped, { id: "c2", kind: "image_candidate", content: "v2" });
  assert.throws(
    () => runCritiqueCycle(capped, "c2", { scoreOverrides: { brand_fit: 60, clarity: 65 } }),
    /revision_cap_exceeded/,
  );

  console.log("quality.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run();
