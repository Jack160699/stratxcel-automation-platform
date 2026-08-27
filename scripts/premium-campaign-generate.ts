// Premium Creative Intelligence real-generation benchmark (Social
// Autopilot). Builds on scripts/quality-campaign-generate.ts's exact
// proven infrastructure (same GeminiTextProvider, same GOOGLE_CHEAP model,
// same withTransientRetry pacing, same real Vercel-configured
// GEMINI_API_KEY) and adds the new premium layer on top: a real
// Creative-Treatment generation call (creative-treatment.ts) BEFORE copy,
// grounded in Brand Visual DNA + industry visual vocabulary + the real
// sourced visual-research library -- then scores both the existing
// production quality-score.ts gate AND the new premium-creative-score.ts
// rubric's text-derivable dimensions.
//
// Deliberately smaller than the prior 70-creative campaign (3 per fixture
// x 7 = 21): the treatment step roughly doubles real API calls per
// creative (one for the treatment, one for copy), and this benchmark's
// purpose is a genuine before/after on the CREATIVE/VISUAL layer, not a
// repeat of the already-established text-generation pass-rate campaign.
//
// Usage: node --experimental-strip-types scripts/premium-campaign-generate.ts [countPerFixture] [outDir]

import fs from "node:fs";
import path from "node:path";
import { GeminiTextProvider, resolveModelId, AIProviderError, isTransientFallbackWorthy, type AIMessage } from "@stratxcel/ai-runtime";
import { buildCreativeBrief, formatCreativeBriefForPrompt, selectObjective } from "../lib/social/creative-brief.ts";
import { scoreGeneratedContent, type QualityScoreInput } from "../lib/social/quality-score.ts";
import { runGenerationLoop } from "../lib/social/generation-loop.ts";
import { buildVerifiedBusinessInformation } from "../lib/social/package-business-facts.ts";
import { parseGeneratedCopy, type GeneratedCopy } from "../lib/social/generated-copy-parser.ts";
import { ALL_FIXTURES, type BusinessFixture } from "../lib/social/__tests__/fixtures/business-fixtures.ts";
import type { ContentObjective } from "../lib/social/content-options.ts";
import { loadVercelCredential } from "./lib/load-vercel-credential.ts";
import { buildCreativeTreatmentPrompt, validateCreativeTreatment, safeParseJson, resolveOverlayElements, TREATMENT_JSON_SCHEMA, type CreativeTreatment } from "../lib/social/creative-treatment.ts";
import { deriveBrandVisualDNA } from "../lib/social/brand-visual-dna.ts";
import { getIndustryVisualVocabulary } from "../lib/social/industry-visual-vocabulary.ts";
import { researchInsightsForIndustry } from "../lib/social/visual-research-library.ts";
import { measureTextDensity, evaluateTextDensityGate } from "../lib/social/text-density.ts";
import { scorePremiumCreative, type PremiumScoreResult } from "../lib/social/premium-creative-score.ts";
import { visualFingerprintFromTreatment, checkVisualRepetition } from "../lib/social/content-diversity.ts";
import { buildVisualDirectorBrief } from "../lib/social/visual-director-prompt.ts";

const COUNT_PER_FIXTURE = Number(process.argv[2] ?? "3");
const OUT_DIR = process.argv[3] ?? path.join(process.cwd(), "scratch", "premium-campaign");
const MODEL = resolveModelId("GOOGLE_CHEAP");
const CANONICAL_PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram" };

if (!process.env.GEMINI_API_KEY) {
  const result = loadVercelCredential(path.join(process.cwd(), "scratch", ".env.vercel-preview.local"), "GEMINI_API_KEY");
  if (result.status !== "loaded") {
    console.error(`BLOCKED: could not load GEMINI_API_KEY (${result.status}). Cannot run real generation.`);
    process.exit(1);
  }
  console.log(`Loaded GEMINI_API_KEY from Vercel Preview env (length=${result.length} chars) -- value itself never logged.`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const provider = new GeminiTextProvider();
const INTER_CALL_DELAY_MS = 4_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTransientRetry<T>(label: string, maxRetries: number, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const category = err instanceof AIProviderError ? err.category : undefined;
      if (!isTransientFallbackWorthy(category) || attempt === maxRetries) throw err;
      const backoffMs = 5_000 * (attempt + 1);
      console.log(`    [${label}] transient error (${category}), retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
    }
  }
  throw lastErr;
}

interface PremiumCreativeResult {
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
  textQualityScore: number;
  textQualityPassed: boolean;
  hardFailures: Array<{ reason: string; detail: string }>;
  /** Real per-attempt diagnostics -- the top-level score/caption/
   * hardFailures above are BLANKED BY DESIGN on failure (generation-loop.ts
   * returns content:null/scoreResult:null once maxAttempts is exhausted,
   * an intentional "disqualified" marker) -- this is where the actual
   * last-attempt score and reason live. Never infer "what really happened"
   * from the top-level fields alone. */
  attempts: Array<{ attempt: number; score: number; hardFailureReasons: string[] }>;
  lastGeneratedTitle: string;
  lastGeneratedCaption: string;
  treatment: CreativeTreatment | null;
  treatmentIssues: string[];
  textDensity: ReturnType<typeof measureTextDensity> | null;
  textDensityGatePass: boolean | null;
  premiumScore: PremiumScoreResult | null;
  visualDuplicate: boolean;
  visualDuplicateReason: string | null;
  imageBrief: string | null;
}

async function generateTreatment(
  fixture: BusinessFixture,
  brief: ReturnType<typeof buildCreativeBrief>,
  recentVisualFingerprints: string[]
): Promise<{ treatment: CreativeTreatment | null; issues: string[] }> {
  const brandDNA = deriveBrandVisualDNA({ brandColors: fixture.brandColors, brandTone: fixture.brandTone, industryCategory: brief.industry });
  const visualVocab = getIndustryVisualVocabulary(brief.industry);
  const researchInsights = researchInsightsForIndustry(brief.industry === "generic" ? "all" : brief.industry);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages: AIMessage[] = buildCreativeTreatmentPrompt({
      brief, businessName: fixture.businessName, industry: brief.industry, brandDNA, visualVocab, mediaType: "image", researchInsights,
    });
    const result = await withTransientRetry(`${fixture.key}-treatment`, 3, () =>
      provider.complete({ model: MODEL, messages, reasoningLevel: "medium", timeoutMs: 60_000, structuredOutputSchema: TREATMENT_JSON_SCHEMA as unknown as Record<string, unknown> })
    );
    const parsed = safeParseJson(result.text);
    const issues = validateCreativeTreatment(parsed, { concept: brief.concept });
    if (!issues.length) {
      const t = parsed as CreativeTreatment;
      const fp = visualFingerprintFromTreatment(t);
      const dup = checkVisualRepetition(fp, recentVisualFingerprints);
      if (!dup.isDuplicate || attempt === 1) return { treatment: t, issues: dup.isDuplicate ? [`visual: ${dup.reason}`] : [] };
      // duplicate composition on attempt 0 -- retry once for real variety
      continue;
    }
    if (attempt === 1) return { treatment: null, issues: issues.map((i) => `${i.field}: ${i.issue}`) };
  }
  return { treatment: null, issues: ["exhausted treatment attempts"] };
}

async function generateOneCreative(
  fixture: BusinessFixture,
  index: number,
  recentPillars: string[],
  recentConcepts: string[],
  recentCaptions: string[],
  recentObjectives: ContentObjective[],
  recentVisualFingerprints: string[]
): Promise<PremiumCreativeResult> {
  const platform = "instagram";
  const verifiedFacts = buildVerifiedBusinessInformation({ googleBusiness: fixture.googleBusiness, brandBrain: fixture.brandBrain });
  const objective = selectObjective({ hasOffer: false, recentObjectives });
  const brief = buildCreativeBrief({
    businessName: fixture.businessName, industryText: fixture.industryText, descriptionText: fixture.descriptionText,
    platform, mediaType: "image", availablePillars: fixture.contentPillars, recentPillars, recentConcepts, objective,
    verifiedFacts, brandTone: fixture.brandTone, audience: fixture.audience,
  });

  const { treatment, issues: treatmentIssues } = await generateTreatment(fixture, brief, recentVisualFingerprints);
  await sleep(INTER_CALL_DELAY_MS);

  // Boxed in an object rather than a bare `let` -- TS's control-flow
  // narrowing across the async closure below otherwise infers a bare `let`
  // as `never` by the time it's read after the closure, a known TS
  // narrowing quirk with mutation-through-closure.
  const lastCopyBox: { value: GeneratedCopy | null } = { value: null };
  const loopResult = await runGenerationLoop({
    maxAttempts: 2,
    generate: async (correctiveInstructions) => {
      const prompt = [
        `Generate ONE ${CANONICAL_PLATFORM_LABEL[platform] ?? platform} post for this brand, creative ${index + 1}.`,
        formatCreativeBriefForPrompt(brief),
        treatment
          ? [
              `A REAL CREATIVE CONCEPT HAS ALREADY BEEN DEVELOPED -- write copy that matches it exactly:`,
              `- Concept: ${treatment.concept}`,
              `- Hook: ${treatment.hook}`,
              `- Story: ${treatment.story}`,
              treatment.textHierarchy.length ? `- Planned on-image text: ${treatment.textHierarchy.map((e) => `${e.role}: "${e.text}"`).join("; ")}` : "- No on-image text planned -- the caption carries the full message.",
              treatment.cta.needed ? `- CTA: ${treatment.cta.text}` : `- No CTA needed (${treatment.cta.rationale}).`,
            ].join("\n")
          : "",
        `Respond with ONLY strict JSON: {"title": string, "masterIdea": string, "caption": string, "hashtags": string[]}.`,
        correctiveInstructions.length ? `CORRECTIONS:\n${correctiveInstructions.map((i) => `- ${i}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
      const messages: AIMessage[] = [
        { role: "system", content: `You are writing a real social media post for ${fixture.businessName}, a real business. Follow the creative brief exactly. Never invent facts not given to you.` },
        { role: "user", content: prompt },
      ];
      const result = await withTransientRetry(`${fixture.key}#${index + 1}-copy`, 3, () =>
        provider.complete({ model: MODEL, messages, reasoningLevel: "low", timeoutMs: 60_000 })
      );
      if (process.env.DEBUG_RAW_COPY) console.log(`\n--- RAW COPY (${fixture.key}#${index + 1}) ---\n${result.text}\n--- END ---\n`);
      const copy = parseGeneratedCopy(result.text);
      lastCopyBox.value = copy;
      return copy;
    },
    toScoreInput: (copy): QualityScoreInput => ({
      caption: copy.caption, title: copy.title, hashtags: copy.hashtags, businessName: fixture.businessName,
      contentPillar: brief.contentPillar, concept: brief.concept, industry: brief.industry, verifiedFacts,
      brandTone: fixture.brandTone, audience: brief.audience, objective: brief.objective, recentCaptions, recentConcepts,
    }),
  });

  const finalScore = loopResult.scoreResult ?? scoreGeneratedContent({
    caption: "", title: "", hashtags: [], businessName: fixture.businessName, contentPillar: brief.contentPillar,
    concept: brief.concept, industry: brief.industry, verifiedFacts, objective: brief.objective, recentCaptions, recentConcepts,
  });

  let textDensity = null;
  let textDensityGatePass: boolean | null = null;
  let premiumScore: PremiumScoreResult | null = null;
  let visualDuplicate = false;
  let visualDuplicateReason: string | null = null;
  let imageBrief: string | null = null;

  if (treatment) {
    // resolveOverlayElements, not treatment.textHierarchy directly -- a
    // needed CTA the model didn't duplicate into textHierarchy still
    // counts as real on-image text once it's actually rendered.
    textDensity = measureTextDensity(resolveOverlayElements(treatment));
    textDensityGatePass = evaluateTextDensityGate(textDensity, { intentionallyTextLed: treatment.intentionallyTextLed }).pass;
    premiumScore = scorePremiumCreative({ treatment, brief, generatedCaption: loopResult.content?.caption ?? null, textDensity, recentConceptTexts: recentConcepts });
    const fp = visualFingerprintFromTreatment(treatment);
    const dup = checkVisualRepetition(fp, recentVisualFingerprints);
    visualDuplicate = dup.isDuplicate;
    visualDuplicateReason = dup.reason;
    const brandDNA = deriveBrandVisualDNA({ brandColors: fixture.brandColors, brandTone: fixture.brandTone, industryCategory: brief.industry });
    imageBrief = buildVisualDirectorBrief({ treatment, businessName: fixture.businessName, brandDNA });
  }

  return {
    fixture: fixture.key, index, platform, objective: brief.objective, contentPillar: brief.contentPillar, concept: brief.concept,
    industry: brief.industry, audience: brief.audience, verifiedFacts,
    title: loopResult.content?.title ?? "", caption: loopResult.content?.caption ?? "", hashtags: loopResult.content?.hashtags ?? [],
    textQualityScore: finalScore.score, textQualityPassed: loopResult.success, hardFailures: finalScore.hardFailures,
    attempts: loopResult.attempts.map((a) => ({ attempt: a.attempt, score: a.score, hardFailureReasons: a.hardFailureReasons })),
    lastGeneratedTitle: lastCopyBox.value?.title ?? "", lastGeneratedCaption: lastCopyBox.value?.caption ?? "",
    treatment, treatmentIssues, textDensity, textDensityGatePass, premiumScore, visualDuplicate, visualDuplicateReason, imageBrief,
  };
}

async function main() {
  const results: PremiumCreativeResult[] = [];
  const fixturesToRun = process.env.ONLY_FIXTURE ? ALL_FIXTURES.filter((f) => f.key === process.env.ONLY_FIXTURE) : ALL_FIXTURES;
  for (const fixture of fixturesToRun) {
    const recentPillars: string[] = [];
    const recentConcepts: string[] = [];
    const recentCaptions: string[] = [];
    const recentObjectives: ContentObjective[] = [];
    const recentVisualFingerprints: string[] = [];
    for (let i = 0; i < COUNT_PER_FIXTURE; i += 1) {
      console.log(`\n=== ${fixture.key} #${i + 1}/${COUNT_PER_FIXTURE} ===`);
      const result = await generateOneCreative(fixture, i, recentPillars, recentConcepts, recentCaptions, recentObjectives, recentVisualFingerprints);
      results.push(result);
      console.log(`  textQuality=${result.textQualityScore}/100 passed=${result.textQualityPassed} treatment=${result.treatment ? "OK" : "FAILED:" + result.treatmentIssues.join(";")}`);
      if (!result.textQualityPassed) console.log(`  real attempt history: ${result.attempts.map((a) => `#${a.attempt} score=${a.score} reasons=[${a.hardFailureReasons.join(",")}]`).join(" | ")}`);
      if (result.premiumScore) console.log(`  premium(text-derivable)=${result.premiumScore.textDerivableScore}/${result.premiumScore.textDerivableMax} textDensity=${result.textDensity?.density} visualDup=${result.visualDuplicate}`);
      recentPillars.unshift(result.contentPillar);
      recentConcepts.unshift(result.concept);
      if (result.caption) recentCaptions.unshift(result.caption);
      recentObjectives.unshift(result.objective);
      if (result.treatment) recentVisualFingerprints.unshift(visualFingerprintFromTreatment(result.treatment));
      await sleep(INTER_CALL_DELAY_MS);
    }
  }

  const outPath = path.join(OUT_DIR, `results-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${results.length}`);
  console.log(`Text quality passed: ${results.filter((r) => r.textQualityPassed).length}`);
  console.log(`Treatment generated successfully: ${results.filter((r) => r.treatment).length}`);
  console.log(`Text density gate passed: ${results.filter((r) => r.textDensityGatePass).length}`);
  console.log(`Visual duplicates flagged: ${results.filter((r) => r.visualDuplicate).length}`);
  console.log(`Saved: ${outPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
