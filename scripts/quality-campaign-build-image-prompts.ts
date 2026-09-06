// Builds the real image-generation request bodies (prompt + aspect ratio)
// for every PASSED creative in a quality-campaign results file, using the
// exact same production prompt-construction functions
// (buildProviderReadyImagePrompt / snapshotImageBrandContext) as
// scripts/quality-campaign-generate-images.ts. Writes one JSON file per
// creative to outDir, named <fixture>-<index+1>.request.json, matching the
// {prompt, aspectRatio, tier, tenantId, forceProvider} shape expected by
// app/api/quality-campaign-bridge's POST handler.
//
// No API keys or network calls here at all -- purely local prompt assembly,
// so the actual provider call can be driven separately (e.g. one
// `vercel curl` invocation per file, through the deployed bridge).
//
// Usage: node --experimental-strip-types scripts/quality-campaign-build-image-prompts.ts <resultsJsonPath> <outDir>

import fs from "node:fs";
import path from "node:path";
import {
  buildProviderReadyImagePrompt,
  snapshotImageBrandContext,
} from "@stratxcel/ai-runtime";
import { aspectRatioForMediaType } from "../lib/social/visual-creative-contract.ts";
import { ALL_FIXTURES, type BusinessFixture } from "../lib/social/__tests__/fixtures/business-fixtures.ts";

interface CreativeResult {
  fixture: string;
  index: number;
  concept: string;
  title: string;
  caption: string;
  passed: boolean;
}

const RESULTS_PATH = process.argv[2];
const OUT_DIR = process.argv[3];

if (!RESULTS_PATH || !fs.existsSync(RESULTS_PATH) || !OUT_DIR) {
  console.error("Usage: quality-campaign-build-image-prompts.ts <resultsJsonPath> <outDir>");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

function fixtureByKey(key: string): BusinessFixture {
  const found = ALL_FIXTURES.find((f) => f.key === key);
  if (!found) throw new Error(`unknown fixture: ${key}`);
  return found;
}

const allResults: CreativeResult[] = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
const passed = allResults.filter((r) => r.passed);

const written: string[] = [];
for (const creative of passed) {
  const fixture = fixtureByKey(creative.fixture);
  const brandContext = snapshotImageBrandContext({
    business_name: fixture.businessName,
    industry: fixture.industryText,
    tone_of_voice: fixture.brandTone.join(", "),
    target_audience: fixture.audience,
    products: fixture.contentPillars,
    visual_direction: `Professional photography for a ${fixture.industryText.toLowerCase()}: ${creative.concept}. Depict ${fixture.businessName}'s actual context -- never generic stock imagery or an unrelated business type.`,
    color_hints: fixture.brandColors,
    locations: fixture.googleBusiness?.address ?? fixture.brandBrain?.location ?? "",
  });
  const prompt = buildProviderReadyImagePrompt({
    brief: `${creative.title}. ${creative.caption}`,
    intendedUse: "social_post",
    aspectRatio: aspectRatioForMediaType("image"),
    brandContext,
  });
  const fileName = `${creative.fixture}-${creative.index + 1}.request.json`;
  const filePath = path.join(OUT_DIR, fileName);
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      prompt,
      aspectRatio: aspectRatioForMediaType("image"),
      tier: "standard",
      tenantId: "quality-campaign-preview-bridge",
      forceProvider: "openai",
      // "high" (the OpenAI default) was measured to exceed the runtime's
      // 150s per-request timeout outright (image_provider_timeout, zero
      // candidates) -- "medium" is OpenAI's own recommended production
      // default for gpt-image-1/2 and completes comfortably inside budget
      // while remaining full real production-quality output, not a
      // degraded/test-only setting.
      quality: "medium",
      _fixture: creative.fixture,
      _index: creative.index,
    }),
    "utf8"
  );
  written.push(filePath);
  console.log(`${fileName}: prompt ${prompt.length} chars`);
}

console.log(`\nWrote ${written.length} request bodies to ${OUT_DIR}`);
