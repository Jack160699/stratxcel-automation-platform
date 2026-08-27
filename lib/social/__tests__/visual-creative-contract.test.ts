// Run with: node --experimental-strip-types lib/social/__tests__/visual-creative-contract.test.ts
import assert from "node:assert/strict";
import {
  validateVisualCreativeBrief,
  assessVisualBriefEngineering,
  buildVisualRegenerationRequest,
  aspectRatioForMediaType,
  constraintsForAspectRatio,
  type VisualCreativeBrief,
} from "../visual-creative-contract.ts";

const GOOD_BRIEF: VisualCreativeBrief = {
  aspectRatio: "4:5",
  headline: "Fresh Fish Curry Tonight",
  supportingLine: "Book a table at Coastal Kitchen",
  logoPlacement: "bottom-right",
  brandColors: ["#1E5631"],
  imageryDirection: "Close-up of Kerala fish curry plated at Coastal Kitchen",
  layoutDirection: "Single focal dish, headline top third",
};

function testWellFormedBriefHasNoIssues() {
  assert.deepEqual(validateVisualCreativeBrief(GOOD_BRIEF), []);
  console.log("visual-creative-contract.test.ts: a well-formed brief has zero validation issues — PASS");
}

function testEmptyHeadlineIsAnIssue() {
  const issues = validateVisualCreativeBrief({ ...GOOD_BRIEF, headline: "" });
  assert.ok(issues.some((i) => i.field === "headline"));
  console.log("visual-creative-contract.test.ts: empty headline flagged — PASS");
}

function testOverlongHeadlineForAspectRatioIsAnIssue() {
  const tooLong = "This headline is deliberately far too long to fit legibly on a 9:16 vertical reel format at a glance";
  const issues = validateVisualCreativeBrief({ ...GOOD_BRIEF, aspectRatio: "9:16", headline: tooLong });
  assert.ok(issues.some((i) => i.field === "headline" && i.issue.includes("9:16")));
  console.log("visual-creative-contract.test.ts: headline exceeding the format's legibility limit is flagged — PASS");
}

function testSameHeadlineOkOnRoomierAspectRatio() {
  const headline = "Book Your Weekend Brunch Table Right Now";
  const tight = validateVisualCreativeBrief({ ...GOOD_BRIEF, aspectRatio: "9:16", headline });
  const roomy = validateVisualCreativeBrief({ ...GOOD_BRIEF, aspectRatio: "16:9", headline });
  assert.ok(constraintsForAspectRatio("16:9").maxHeadlineChars > constraintsForAspectRatio("9:16").maxHeadlineChars);
  assert.deepEqual(roomy.filter((i) => i.field === "headline"), []);
  void tight;
  console.log("visual-creative-contract.test.ts: text-length constraints genuinely vary by aspect ratio — PASS");
}

function testInvalidLogoPlacementFlagged() {
  const issues = validateVisualCreativeBrief({ ...GOOD_BRIEF, logoPlacement: "center" as never });
  assert.ok(issues.some((i) => i.field === "logoPlacement"));
  console.log("visual-creative-contract.test.ts: invalid logo placement enum value flagged — PASS");
}

function testMissingImageryDirectionFlagged() {
  const issues = validateVisualCreativeBrief({ ...GOOD_BRIEF, imageryDirection: "" });
  assert.ok(issues.some((i) => i.field === "imageryDirection"));
  console.log("visual-creative-contract.test.ts: empty imagery direction flagged — PASS");
}

function testUnsupportedAspectRatioFlagged() {
  const issues = validateVisualCreativeBrief({ ...GOOD_BRIEF, aspectRatio: "21:9" as never });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, "aspectRatio");
  console.log("visual-creative-contract.test.ts: unsupported aspect ratio flagged and short-circuits further checks — PASS");
}

function testAssessmentIsHonestlyLabeledPending() {
  const good = assessVisualBriefEngineering(GOOD_BRIEF);
  assert.equal(good.status, "PENDING_LIVE_VISUAL_VALIDATION");
  assert.equal(good.structurallyValid, true);
  assert.ok(good.notes.some((n) => n.toLowerCase().includes("does not assess")), "must explicitly disclaim that this isn't a real visual quality judgment");
  const bad = assessVisualBriefEngineering({ ...GOOD_BRIEF, headline: "" });
  assert.equal(bad.status, "PENDING_LIVE_VISUAL_VALIDATION", "status is always PENDING regardless of structural validity -- never claims a real assessment");
  assert.equal(bad.structurallyValid, false);
  console.log("visual-creative-contract.test.ts: assessment is always honestly labeled PENDING_LIVE_VISUAL_VALIDATION — PASS");
}

function testRegenerationRequestNullWhenBriefIsSound() {
  assert.equal(buildVisualRegenerationRequest(GOOD_BRIEF), null);
  console.log("visual-creative-contract.test.ts: a sound brief needs no regeneration request — PASS");
}

function testRegenerationRequestIsSpecificNotBlind() {
  const request = buildVisualRegenerationRequest({ ...GOOD_BRIEF, headline: "", logoPlacement: "center" as never });
  assert.ok(request);
  assert.ok(request!.reason.includes("headline"));
  assert.ok(request!.reason.includes("logoPlacement"));
  assert.ok(request!.correctiveDirection.length > 20, "corrective direction must be a real, specific instruction, not a stub");
  console.log("visual-creative-contract.test.ts: regeneration request is specific to the actual issues found — PASS");
}

function testAspectRatioForMediaType() {
  assert.equal(aspectRatioForMediaType("reel"), "9:16");
  assert.equal(aspectRatioForMediaType("video"), "9:16");
  // Finished Premium Marketing Creative brief Section 4: the default
  // Instagram feed creative canvas is 1080x1080 square, not a generic
  // portrait mechanically cropped afterward.
  assert.equal(aspectRatioForMediaType("image"), "1:1");
  console.log("visual-creative-contract.test.ts: aspectRatioForMediaType maps reel/video to vertical, image to the default 1:1 square feed canvas — PASS");
}

function run() {
  testWellFormedBriefHasNoIssues();
  testEmptyHeadlineIsAnIssue();
  testOverlongHeadlineForAspectRatioIsAnIssue();
  testSameHeadlineOkOnRoomierAspectRatio();
  testInvalidLogoPlacementFlagged();
  testMissingImageryDirectionFlagged();
  testUnsupportedAspectRatioFlagged();
  testAssessmentIsHonestlyLabeledPending();
  testRegenerationRequestNullWhenBriefIsSound();
  testRegenerationRequestIsSpecificNotBlind();
  testAspectRatioForMediaType();
  console.log("visual-creative-contract.test.ts: ALL PASS");
}

run();
