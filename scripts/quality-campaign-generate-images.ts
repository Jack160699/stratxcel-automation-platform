// Real image-generation harness (Social Autopilot quality campaign).
//
// Uses the REAL ImageMediaRuntime class from @stratxcel/ai-runtime -- the
// exact class production's image pipeline (lib/image-generation/service.ts
// -> packages/ai-runtime/src/adapters/creative-studio.ts ->
// ImageMediaRuntime) wraps -- with the project's real, Vercel-configured
// GEMINI_API_KEY (see load-vercel-credential.ts / quality-campaign-generate.ts
// for how that credential was verified). No `storage` dependency is passed,
// so nothing is written to Supabase or any canonical asset store -- the
// runtime returns the generated image as a base64 data URI directly
// (packages/ai-runtime/src/media/image.ts: "Set when persisted -- never a
// data: URI" applies to the storedAsset field, not the base candidate),
// which this script decodes and saves to a LOCAL file for visual
// inspection. buildProviderReadyImagePrompt/snapshotImageBrandContext are
// the exact functions production's own image-generation prompt
// construction uses (packages/ai-runtime/src/media/image-prompt.ts).
//
// Usage: node --experimental-strip-types scripts/quality-campaign-generate-images.ts [resultsJsonPath] [countPerFixture] [outDir]
//   resultsJsonPath: a results-*.json file from quality-campaign-generate.ts
//   countPerFixture: how many of that fixture's PASSED creatives to render (default 1)

import fs from "node:fs";
import path from "node:path";
import {
  ImageMediaRuntime,
  buildProviderReadyImagePrompt,
  snapshotImageBrandContext,
} from "@stratxcel/ai-runtime";
import { aspectRatioForMediaType } from "../lib/social/visual-creative-contract.ts";
import { ALL_FIXTURES, type BusinessFixture } from "../lib/social/__tests__/fixtures/business-fixtures.ts";
import { loadVercelCredential } from "./lib/load-vercel-credential.ts";

interface CreativeResult {
  fixture: string;
  index: number;
  contentPillar: string;
  concept: string;
  industry: string;
  audience: string;
  title: string;
  caption: string;
  hashtags: string[];
  score: number;
  passed: boolean;
}

const RESULTS_PATH = process.argv[2];
const COUNT_PER_FIXTURE = Number(process.argv[3] ?? "1");
const OUT_DIR = process.argv[4] ?? path.join(process.cwd(), "scratch", "quality-campaign-images");

if (!RESULTS_PATH || !fs.existsSync(RESULTS_PATH)) {
  console.error("Usage: quality-campaign-generate-images.ts <resultsJsonPath> [countPerFixture] [outDir]");
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  const result = loadVercelCredential(path.join(process.cwd(), ".env.vercel-preview.local"), "GEMINI_API_KEY");
  if (result.status !== "loaded") {
    console.error(`BLOCKED: could not load GEMINI_API_KEY (${result.status}). Cannot run real image generation.`);
    process.exit(1);
  }
  console.log(`Loaded GEMINI_API_KEY from Vercel Preview env (length=${result.length} chars) -- value itself never logged.`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const runtime = new ImageMediaRuntime({}); // no storage -> data: URI candidates only, no DB writes
if (!runtime.isConfigured()) {
  console.error("BLOCKED: ImageMediaRuntime.isConfigured() is false even after loading GEMINI_API_KEY.");
  process.exit(1);
}

function fixtureByKey(key: string): BusinessFixture {
  const found = ALL_FIXTURES.find((f) => f.key === key);
  if (!found) throw new Error(`unknown fixture: ${key}`);
  return found;
}

async function main() {
  const allResults: CreativeResult[] = JSON.parse(fs.readFileSync(RESULTS_PATH!, "utf8"));
  const byFixture = new Map<string, CreativeResult[]>();
  for (const r of allResults) {
    if (!r.passed) continue; // only render creatives that actually passed the real quality gate
    if (!byFixture.has(r.fixture)) byFixture.set(r.fixture, []);
    byFixture.get(r.fixture)!.push(r);
  }

  let totalCost = 0;
  const manifest: Array<{ fixture: string; index: number; file: string; provider: string | null; model: string | null; costUsd: number; outcome: string }> = [];

  for (const [fixtureKey, creatives] of byFixture) {
    const fixture = fixtureByKey(fixtureKey);
    const take = creatives.slice(0, COUNT_PER_FIXTURE);
    for (const creative of take) {
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
      console.log(`\n=== ${fixtureKey} #${creative.index + 1} ===`);
      console.log(`Prompt (${prompt.length} chars): ${prompt.slice(0, 200)}...`);
      try {
        const outcome = await runtime.generate({
          tenantId: "quality-campaign-local-test", // no storage configured -> never looked up in any DB
          prompt,
          aspectRatio: aspectRatioForMediaType("image"),
          tier: "standard",
          candidateCount: 1,
        });
        totalCost += outcome.recordedProviderCostUsd ?? 0;
        if (outcome.outcome !== "OK" || !outcome.selected) {
          console.log(`  FAILED: outcome=${outcome.outcome} reason=${outcome.reason} provider=${outcome.provider} model=${outcome.model}`);
          manifest.push({ fixture: fixtureKey, index: creative.index, file: "", provider: outcome.provider, model: outcome.model, costUsd: outcome.recordedProviderCostUsd ?? 0, outcome: `${outcome.outcome}:${outcome.reason}` });
          continue;
        }
        const candidate = outcome.selected;
        const match = candidate.uri.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          console.log(`  FAILED: candidate.uri was not a data: URI (got a bare url, unexpected with no storage configured)`);
          manifest.push({ fixture: fixtureKey, index: creative.index, file: "", provider: candidate.provider, model: candidate.model, costUsd: candidate.estimatedCostUsd, outcome: "unexpected_non_data_uri" });
          continue;
        }
        const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
        const fileName = `${fixtureKey}-${creative.index + 1}.${ext}`;
        const filePath = path.join(OUT_DIR, fileName);
        fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
        console.log(`  OK: provider=${candidate.provider} model=${candidate.model} cost=$${candidate.estimatedCostUsd.toFixed(4)} -> ${filePath}`);
        manifest.push({ fixture: fixtureKey, index: creative.index, file: filePath, provider: candidate.provider, model: candidate.model, costUsd: candidate.estimatedCostUsd, outcome: "OK" });
      } catch (err) {
        console.error(`  GENERATION CALL FAILED:`, err instanceof Error ? err.message : err);
        manifest.push({ fixture: fixtureKey, index: creative.index, file: "", provider: null, model: null, costUsd: 0, outcome: err instanceof Error ? err.message : "failed" });
      }
      await new Promise((resolve) => setTimeout(resolve, 4_000));
    }
  }

  const manifestPath = path.join(OUT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\n=== SUMMARY ===`);
  console.log(`Generated: ${manifest.filter((m) => m.outcome === "OK").length}/${manifest.length}, total real provider cost: $${totalCost.toFixed(4)}`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
