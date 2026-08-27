// Real-generation quality campaign harness (Social Autopilot).
//
// Uses the REAL production generation logic -- creative-brief.ts,
// quality-score.ts, generation-loop.ts, package-autopilot.ts's
// parseGeneratedCopy, package-business-facts.ts -- and REAL AI credentials
// (OpenAITextProvider from @stratxcel/ai-runtime, calling the actual
// OpenAI API) against the 7 fixtures already used by the test suite.
//
// SAFETY: deliberately does NOT touch Supabase. No storage/DB dependency is
// passed to any provider -- OpenAITextProvider.complete() and
// ImageMediaRuntime.generate() (used by the companion image script) are
// both callable standalone, with zero database coupling, by design (see
// packages/ai-runtime/src/providers/openai.ts and media/image.ts). This is
// the exact class production uses; only the outer Supabase-backed
// tenant-billing wrapper (AiRuntimeSocialProvider in
// lib/social/agent/provider.ts) is bypassed, since it exists purely to
// meter a REAL tenant's spend against a REAL database row, which is
// deliberately out of scope here. All fixture/recent-history state lives
// in-process; nothing is written to any real database.
//
// Usage: node --experimental-strip-types scripts/quality-campaign-generate.ts [countPerFixture] [outDir]
// Requires OPENAI_API_KEY in the process environment (already present in
// this session -- GEMINI_API_KEY is not set here).

import fs from "node:fs";
import path from "node:path";
import { OpenAITextProvider, resolveModelId, type AIMessage } from "@stratxcel/ai-runtime";
import { buildCreativeBrief, formatCreativeBriefForPrompt, selectObjective } from "../lib/social/creative-brief.ts";
import { scoreGeneratedContent, type QualityScoreInput } from "../lib/social/quality-score.ts";
import { runGenerationLoop } from "../lib/social/generation-loop.ts";
import { buildVerifiedBusinessInformation } from "../lib/social/package-business-facts.ts";
import { parseGeneratedCopy } from "../lib/social/generated-copy-parser.ts";
import { ALL_FIXTURES, type BusinessFixture } from "../lib/social/__tests__/fixtures/business-fixtures.ts";
import type { ContentObjective } from "../lib/social/content-options.ts";

const COUNT_PER_FIXTURE = Number(process.argv[2] ?? "3");
const OUT_DIR = process.argv[3] ?? path.join(process.cwd(), "scratch", "quality-campaign");
const MODEL = resolveModelId("OPENAI_STANDARD_FALLBACK");
const CANONICAL_PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", threads: "Threads", linkedin: "LinkedIn", youtube: "YouTube" };

if (!process.env.OPENAI_API_KEY) {
  console.error("BLOCKED: OPENAI_API_KEY is not set in the process environment. Cannot run real generation.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const provider = new OpenAITextProvider();

interface AttemptLog {
  attempt: number;
  passed: boolean;
  score: number;
  hardFailureReasons: string[];
}

interface CreativeResult {
  fixture: string;
  index: number;
  platform: string;
  objective: ContentObjective;
  contentPillar: string;
  concept: string;
  industry: string;
  audience: string;
  verifiedFacts: string[];
  title: string;
  caption: string;
  hashtags: string[];
  score: number;
  passed: boolean;
  breakdown: Record<string, number>;
  hardFailures: Array<{ reason: string; detail: string }>;
  attempts: AttemptLog[];
  finalReason: string | null;
  rawModelText: string[]; // one entry per attempt, for real transcript inspection
}

async function generateOneCreative(fixture: BusinessFixture, index: number, recentPillars: string[], recentConcepts: string[], recentCaptions: string[], recentObjectives: ContentObjective[]): Promise<CreativeResult> {
  const platform = "instagram";
  const verifiedFacts = buildVerifiedBusinessInformation({ googleBusiness: fixture.googleBusiness, brandBrain: fixture.brandBrain });
  const hasOffer = false; // matches the live pipeline: no offer data source exists yet
  const objective = selectObjective({ hasOffer, recentObjectives });
  const brief = buildCreativeBrief({
    businessName: fixture.businessName,
    industryText: fixture.industryText,
    descriptionText: fixture.descriptionText,
    platform,
    mediaType: "image",
    availablePillars: fixture.contentPillars,
    recentPillars,
    recentConcepts,
    objective,
    verifiedFacts,
    brandTone: fixture.brandTone,
    audience: fixture.audience,
  });

  const rawModelText: string[] = [];
  const loopResult = await runGenerationLoop({
    maxAttempts: 2,
    generate: async (correctiveInstructions) => {
      const prompt = [
        `Generate ONE ${CANONICAL_PLATFORM_LABEL[platform] ?? platform} post for this brand, creative ${index + 1} of an autonomous content package.`,
        formatCreativeBriefForPrompt(brief),
        `Respond with ONLY strict JSON: {"title": string, "masterIdea": string, "caption": string, "hashtags": string[]}.`,
        correctiveInstructions.length
          ? `CORRECTIONS FROM A PREVIOUS ATTEMPT -- apply these specifically:\n${correctiveInstructions.map((i) => `- ${i}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n");
      const messages: AIMessage[] = [
        { role: "system", content: `You are writing a real social media post for ${fixture.businessName}, a real business. Follow the creative brief exactly. Never invent facts not given to you.` },
        { role: "user", content: prompt },
      ];
      const result = await provider.complete({ model: MODEL, messages, reasoningLevel: "low", timeoutMs: 60_000 });
      rawModelText.push(result.text);
      return parseGeneratedCopy(result.text);
    },
    toScoreInput: (copy): QualityScoreInput => ({
      caption: copy.caption,
      title: copy.title,
      hashtags: copy.hashtags,
      businessName: fixture.businessName,
      contentPillar: brief.contentPillar,
      concept: brief.concept,
      industry: brief.industry,
      verifiedFacts,
      brandTone: fixture.brandTone,
      audience: brief.audience,
      objective: brief.objective,
      recentCaptions,
      recentConcepts,
    }),
  });

  const finalScore = loopResult.scoreResult ?? scoreGeneratedContent({
    caption: "", title: "", hashtags: [], businessName: fixture.businessName, contentPillar: brief.contentPillar,
    concept: brief.concept, industry: brief.industry, verifiedFacts, objective: brief.objective, recentCaptions, recentConcepts,
  });

  return {
    fixture: fixture.key,
    index,
    platform,
    objective: brief.objective,
    contentPillar: brief.contentPillar,
    concept: brief.concept,
    industry: brief.industry,
    audience: brief.audience,
    verifiedFacts,
    title: loopResult.content?.title ?? "",
    caption: loopResult.content?.caption ?? "",
    hashtags: loopResult.content?.hashtags ?? [],
    score: finalScore.score,
    passed: loopResult.success,
    breakdown: finalScore.breakdown as unknown as Record<string, number>,
    hardFailures: finalScore.hardFailures,
    attempts: loopResult.attempts.map((a) => ({ attempt: a.attempt, passed: a.passed, score: a.score, hardFailureReasons: a.hardFailureReasons })),
    finalReason: loopResult.finalReason,
    rawModelText,
  };
}

async function main() {
  console.log(`Quality campaign: ${COUNT_PER_FIXTURE} creatives x ${ALL_FIXTURES.length} fixtures = ${COUNT_PER_FIXTURE * ALL_FIXTURES.length} total. Model: ${MODEL}`);
  const allResults: CreativeResult[] = [];

  for (const fixture of ALL_FIXTURES) {
    const recentPillars: string[] = [];
    const recentConcepts: string[] = [];
    const recentCaptions: string[] = [];
    const recentObjectives: ContentObjective[] = [];
    console.log(`\n=== ${fixture.key} (${fixture.businessName}) ===`);
    for (let i = 0; i < COUNT_PER_FIXTURE; i += 1) {
      try {
        const result = await generateOneCreative(fixture, i, [...recentPillars], [...recentConcepts], [...recentCaptions], [...recentObjectives]);
        allResults.push(result);
        recentPillars.unshift(result.contentPillar);
        recentConcepts.unshift(result.concept);
        if (result.caption) recentCaptions.unshift(result.caption);
        recentObjectives.unshift(result.objective);
        console.log(`  [${i + 1}/${COUNT_PER_FIXTURE}] score=${result.score} passed=${result.passed} pillar="${result.contentPillar}" concept="${result.concept}"`);
        if (!result.passed) console.log(`      REJECTED: ${result.finalReason}`);
      } catch (err) {
        console.error(`  [${i + 1}/${COUNT_PER_FIXTURE}] GENERATION CALL FAILED:`, err instanceof Error ? err.message : err);
        allResults.push({
          fixture: fixture.key, index: i, platform: "instagram", objective: "ENGAGEMENT", contentPillar: "", concept: "",
          industry: "generic", audience: "", verifiedFacts: [], title: "", caption: "", hashtags: [],
          score: 0, passed: false, breakdown: {}, hardFailures: [{ reason: "MALFORMED_STRUCTURE", detail: err instanceof Error ? err.message : "generation call failed" }],
          attempts: [], finalReason: err instanceof Error ? err.message : "generation call failed", rawModelText: [],
        });
      }
    }
  }

  const outFile = path.join(OUT_DIR, `results-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(allResults, null, 2), "utf8");
  console.log(`\nWrote ${allResults.length} results to ${outFile}`);

  const passed = allResults.filter((r) => r.passed);
  const scores = allResults.map((r) => r.score).sort((a, b) => a - b);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${allResults.length}, Passed: ${passed.length}, Rejected: ${allResults.length - passed.length}, Pass rate: ${((passed.length / allResults.length) * 100).toFixed(1)}%`);
  console.log(`Avg score: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)}, Median: ${scores[Math.floor(scores.length / 2)]}, Min: ${scores[0]}, Max: ${scores[scores.length - 1]}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
