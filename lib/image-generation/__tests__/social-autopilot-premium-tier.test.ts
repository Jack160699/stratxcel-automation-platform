// Image Quality + Marketing Creative Certification mission (2026-09-06):
// this pass first switched automated Social Autopilot posts to the Local
// AI server's "premium" tier (sdxl-premium/6800MB) after a real, controlled
// A/B benchmark showed a higher quality_score (0.822 vs 0.767) and better
// subject-count prompt adherence than "standard" (sdxl-quality/5500MB).
//
// That change was REVERTED within the same pass after real production
// evidence: premium's measured generation time (113-125s) routinely
// exceeds the free Cloudflare tunnel's ~100s edge/proxy timeout, causing a
// real fraction of automated attempts to fail with HTTP 524 (Cloudflare's
// own timeout page, not a StratXcel/FastAPI response) -- confirmed live via
// an actual ai_image_provider_hop log line ("PROVIDER_FAILURE:Local AI
// image HTTP 524") at 125.5s on a real automated generation. "quality"
// tier's measured ~90-91s stays safely under that ceiling. The mission's
// own stated priority order -- "QUALITY, ACCURACY, CONSISTENCY, PROMPT
// ADHERENCE" -- is why this test asserts the REVERTED (standard-tier)
// state: a creative that frequently fails to generate at all is worse for
// consistency than one that reliably succeeds at a slightly lower (but
// still real, gated) quality score.
//
// Static source-inspection test (service.ts cannot be imported directly --
// it starts with `import "server-only"` -- matches this repo's established
// convention, see social-autopilot-overlay-parity.test.ts in this same
// directory for the identical pattern).
// Run with: node --experimental-strip-types lib/image-generation/__tests__/social-autopilot-premium-tier.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "service.ts"), "utf8");

function run() {
  assert.match(
    source,
    /tier: "standard",/,
    "the real media.images.generate() call must stay on 'standard' tier (sdxl-quality, ~90s) -- 'premium' (sdxl-premium, 113-125s) was tried and reverted this same mission after real production evidence of HTTP 524 timeouts against the free Cloudflare tunnel's ~100s edge limit"
  );
  assert.doesNotMatch(
    source,
    /tier: job\.source_context === "social_autopilot" \? "premium"/,
    "must not silently reintroduce the reverted premium-for-automated-posts branch -- see this test's header for the real HTTP 524 evidence that made it unsafe"
  );
  assert.match(source, /const outcome = await media\.images\.generate\(\{/, "the tier decision must apply to the real, single production image-generation call, not a duplicate path");

  console.log("social-autopilot-premium-tier.test.ts: automated Social Autopilot posts stay on the Cloudflare-timeout-safe 'standard' tier (premium reverted after real HTTP 524 evidence) — PASS");
}

run();
