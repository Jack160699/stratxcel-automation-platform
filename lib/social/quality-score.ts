/**
 * Deterministic quality-scoring engine (build brief Phase B / original
 * Section 15). Scores generated content 0-100 across ten weighted
 * dimensions and independently detects hard-fail conditions that override
 * the numeric score entirely -- a 95/100 caption with an invented phone
 * number is still a REJECT, never a "mostly good" pass.
 *
 * Every failure carries a specific QualityFailureReason code plus a human
 * diagnostic string -- never a bare "quality gate failed".
 *
 * IMPORTANT SCOPE NOTE (Phase J): Visual/Design Quality (15 pts) cannot be
 * genuinely judged without an actual rendered image and a real vision
 * model -- neither exists in this deterministic, no-live-AI build. Its
 * score is a fixed neutral placeholder (see VISUAL_QUALITY_NEUTRAL_SCORE)
 * and `visualQualityPending` is always true on the result. Treat any
 * visualQuality number here as ENGINEERING SCAFFOLDING, not a real
 * assessment -- see visual-creative-contract.ts for the schema this will
 * plug into once live generation exists.
 */

import type { IndustryCategory } from "./industry-taxonomy.ts";
import { getIndustryProfile } from "./industry-taxonomy.ts";
import type { ContentObjective } from "./content-options.ts";
import { findPlaceholderOrFiller } from "./placeholder-detection.ts";
import { checkRepetition, type CreativeFingerprint } from "./content-diversity.ts";

export type QualityFailureReason =
  | "PLACEHOLDER_DETECTED"
  | "MALFORMED_STRUCTURE"
  | "FORBIDDEN_CLAIM"
  | "UNSUPPORTED_FACT"
  | "DUPLICATE_CONCEPT"
  | "WEAK_CTA"
  | "GENERIC_COPY"
  | "LOW_BUSINESS_SPECIFICITY"
  | "LOW_INDUSTRY_RELEVANCE"
  | "BRAND_CONTEXT_MISSING";

export interface QualityFailure {
  reason: QualityFailureReason;
  detail: string;
}

export interface QualityScoreBreakdown {
  businessSpecificity: number;
  personalization: number;
  industryRelevance: number;
  brandConsistency: number;
  creativeOriginality: number;
  copyQuality: number;
  visualQuality: number;
  factualAccuracy: number;
  ctaRelevance: number;
  readability: number;
}

export const DIMENSION_WEIGHTS: QualityScoreBreakdown = {
  businessSpecificity: 15,
  personalization: 15,
  industryRelevance: 10,
  brandConsistency: 10,
  creativeOriginality: 10,
  copyQuality: 10,
  visualQuality: 15,
  factualAccuracy: 5,
  ctaRelevance: 5,
  readability: 5,
};

export const VISUAL_QUALITY_NEUTRAL_SCORE = DIMENSION_WEIGHTS.visualQuality / 2;

export const QUALITY_PASS_THRESHOLD = 90;

export interface QualityScoreInput {
  caption: string;
  title: string;
  hashtags: string[];
  businessName: string;
  contentPillar: string;
  concept: string;
  industry: IndustryCategory;
  /** "Label: value" strings from buildVerifiedBusinessInformation. */
  verifiedFacts: string[];
  brandTone?: string[];
  blockedPhrases?: string[];
  forbiddenClaims?: string[];
  audience?: string;
  objective: ContentObjective;
  /** Recent generated captions for this tenant/authorization, newest first. */
  recentCaptions?: string[];
  recentConcepts?: string[];
}

export interface QualityScoreResult {
  score: number;
  passed: boolean;
  breakdown: QualityScoreBreakdown;
  hardFailures: QualityFailure[];
  diagnostics: string[];
  visualQualityPending: true;
}

function tokenWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

// Section 12: generic marketing adjectives to avoid "unless genuinely
// supported by context" -- weighted, not banned outright (a hard ban lives
// in placeholder-detection.ts for the brief's own named filler PHRASES;
// this is the softer, single-word/short-phrase adjective list).
const GENERIC_ADJECTIVE_WEIGHTS: Array<[string, number]> = [
  ["world-class", 2], ["world class", 2], ["unforgettable", 2], ["redefine", 2], ["redefines", 2],
  ["unlock", 2], ["unlocks", 2], ["elevate", 2], ["elevates", 2], ["elevated", 2], ["unparalleled", 2],
  ["cutting-edge", 2], ["cutting edge", 2], ["state-of-the-art", 2], ["best-in-class", 2],
  ["second to none", 2], ["unmatched", 2], ["exceptional", 1], ["premium", 1], ["amazing", 1],
  ["experience", 1], ["journey", 1],
  // NOT "transform"/"transforms"/"transformative": found against REAL
  // generated output that this substring-matches "transformation", a
  // concrete, specific noun that is itself one of this codebase's own
  // assigned industry concepts (industry-taxonomy.ts's salon/gym
  // "transformation showcase"/"member transformation") -- penalizing the
  // model for successfully executing the exact concept it was asked to
  // write about was a real, evidence-found false positive, not a
  // legitimate generic-copy signal.
];

function genericAdjectiveScore(text: string): { hits: number; weight: number } {
  // Strip legitimate tenure/experience phrases (e.g. "14 years of clinical experience", "10 years experience")
  // so factual doctor/chef backgrounds are never penalized as generic fluff.
  const lower = text.toLowerCase().replace(/\b\d+\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+[a-z]+)?\s+experience\b/g, "");
  let hits = 0;
  let weight = 0;
  for (const [phrase, w] of GENERIC_ADJECTIVE_WEIGHTS) {
    if (lower.includes(phrase)) {
      hits += 1;
      weight += w;
    }
  }
  return { hits, weight };
}

// Claim-shaped patterns: if one of these appears in the caption, it MUST be
// backed by verifiedFacts, or it's an invented fact (Section 5 hard-fail).
const PHONE_PATTERN = /\b(?:\+?\d[\d -]{8,14}\d)\b/;
const DISCOUNT_PATTERN = /\b\d{1,3}\s?%\s?(?:off|discount)\b|\bflat\s+\d{1,3}\s?%\b/i;
const RATING_PATTERN = /\b\d(?:\.\d)?\s?(?:star|stars|\/\s?5|out of 5)\b/i;
const REVIEW_COUNT_PATTERN = /\b\d[\d,]*\+?\s+(?:reviews|ratings)\b/i;
const PRICE_PATTERN = /(?:₹|rs\.?|\$|inr)\s?\d[\d,]*/i;
const GUARANTEE_PATTERN = /\b(?:guarantee(?:d)?|100%\s+(?:satisfaction|money[- ]back))\b/i;

function claimTokensNotInFacts(caption: string, verifiedFacts: string[]): string[] {
  const factsBlob = verifiedFacts.join(" | ").toLowerCase();
  const found: string[] = [];
  for (const pattern of [PHONE_PATTERN, DISCOUNT_PATTERN, RATING_PATTERN, REVIEW_COUNT_PATTERN, PRICE_PATTERN, GUARANTEE_PATTERN]) {
    const match = caption.match(pattern);
    if (!match) continue;
    const claim = match[0];
    // Supported if the claim's own digits/text actually appear in the facts blob.
    const claimLower = claim.toLowerCase();
    if (!factsBlob.includes(claimLower)) found.push(claim);
  }
  return found;
}

const CTA_ACTION_VERBS = [
  "book", "call", "visit", "order", "shop", "enquire", "inquire", "dm", "message", "follow",
  "share", "comment", "reserve", "join", "try", "grab", "check out", "learn more", "read more",
  "swipe", "tap", "click", "link in bio", "sign up", "register", "schedule", "come by", "stop by",
  "get in touch", "reach out", "drop by", "walk in", "pre-order",
  // Found against REAL generated output (quality campaign): "step into
  // Glow Studio for your consultation" is a genuine visit-style CTA a real
  // marketer would recognize -- the verb list was missing this common
  // phrasing entirely.
  "step into", "come see", "head to", "head over", "stop in", "swing by",
  // Found against REAL generated output (Premium Creative Intelligence
  // campaign): "Drop in for a session at our Koramangala box" was hard-
  // failed as WEAK_CTA despite being a genuine, specific, actionable
  // gym-visit CTA -- "drop by"/"walk in" were already covered but "drop
  // in" (a distinct, extremely common real idiom) was not.
  "drop in",
  // Found against REAL generated output (same campaign): "Explore the new
  // arrivals at Connaught Place or online" -- a genuine, specific retail
  // browse/shop CTA -- was hard-failed as WEAK_CTA. "Explore" is a common,
  // real retail/real-estate CTA verb the list was missing entirely.
  "explore",
];

function hasCtaVerb(text: string): boolean {
  const lower = text.toLowerCase();
  return CTA_ACTION_VERBS.some((verb) => lower.includes(verb));
}

export function scoreGeneratedContent(input: QualityScoreInput): QualityScoreResult {
  const caption = input.caption ?? "";
  const title = input.title ?? "";
  const diagnostics: string[] = [];
  const hardFailures: QualityFailure[] = [];

  // --- Structural / input validation (defense in depth -- upstream callers
  // already validate most of this, but the scorer must not silently pass a
  // malformed input). ---
  if (!input.businessName?.trim() || !input.contentPillar?.trim()) {
    hardFailures.push({ reason: "BRAND_CONTEXT_MISSING", detail: "businessName or contentPillar missing from the scoring input -- cannot ground a specificity judgment without them" });
  }
  if (!caption.trim() || caption.trim().length < 10 || !title.trim() || !Array.isArray(input.hashtags)) {
    hardFailures.push({ reason: "MALFORMED_STRUCTURE", detail: "caption/title missing or too short, or hashtags is not an array" });
  }

  // --- Hard-fail: placeholder/template residue (title + caption). ---
  const placeholderHit = findPlaceholderOrFiller(caption) ?? findPlaceholderOrFiller(title);
  if (placeholderHit) {
    hardFailures.push({ reason: "PLACEHOLDER_DETECTED", detail: `contains placeholder/template text: "${placeholderHit}"` });
  }

  // --- Hard-fail: forbidden claim / blocked phrase from Brand Brain rules. ---
  const forbiddenHit = [...(input.blockedPhrases ?? []), ...(input.forbiddenClaims ?? [])]
    .find((phrase) => phrase.trim() && caption.toLowerCase().includes(phrase.trim().toLowerCase()));
  if (forbiddenHit) {
    hardFailures.push({ reason: "FORBIDDEN_CLAIM", detail: `contains a brand-forbidden phrase/claim: "${forbiddenHit}"` });
  }

  // --- Hard-fail: unsupported factual claim (Section 5). ---
  const unsupportedClaims = claimTokensNotInFacts(caption, input.verifiedFacts ?? []);
  if (unsupportedClaims.length) {
    hardFailures.push({ reason: "UNSUPPORTED_FACT", detail: `states a specific claim not present in verified business facts: ${unsupportedClaims.map((c) => `"${c}"`).join(", ")}` });
  }

  // --- Hard-fail: duplicate/repeated content (Section 11/26). ---
  const recentFingerprints: CreativeFingerprint[] = (input.recentCaptions ?? []).map((text, i) => ({
    captionText: text,
    concept: input.recentConcepts?.[i],
  }));
  const repetition = checkRepetition({ captionText: caption, concept: input.concept }, recentFingerprints);
  if (repetition.isDuplicate) {
    hardFailures.push({ reason: "DUPLICATE_CONCEPT", detail: repetition.reason ?? "duplicate of recent content" });
  }

  // --- Hard-fail: no discernible CTA at all. ---
  if (!hasCtaVerb(caption) && !hasCtaVerb(input.hashtags.join(" "))) {
    hardFailures.push({ reason: "WEAK_CTA", detail: "no recognizable call-to-action verb found in the caption or hashtags" });
  }

  // --- Hard-fail: Anti-Template Rule (Mission G §10) ---
  // The generator must NOT repeatedly use default AI/marketing filler buzzwords
  // unless the specific business verified facts explicitly define it.
  const FORBIDDEN_TEMPLATE_BUZZWORDS = [
    "ai-powered",
    "data-driven",
    "end-to-end",
    "grow your business",
    "we grow your business",
    "your social presence, running while you rest",
    "running while you rest",
    "we handle the rest",
    "take care of the rest",
    "take your business online",
    "automated follow-up",
    "end-to-end automation",
    "intelligent platform",
    "experience excellence",
    "quality you can trust",
    "elevate your experience",
    "discover the magic",
    "unleash your potential",
  ];
  const lowerCap = `${title} ${caption}`.toLowerCase();
  for (const buzzword of FORBIDDEN_TEMPLATE_BUZZWORDS) {
    if (lowerCap.includes(buzzword)) {
      hardFailures.push({
        reason: "GENERIC_COPY",
        detail: `violates the Hard Anti-Template rule by using generic filler phrase: "${buzzword}"`,
      });
      break;
    }
  }

  // --- Scoring dimensions (computed regardless of hard-fail status, so a
  // BLOCKED item's diagnostics still show WHERE it was weak). ---
  // Found against REAL generated output (Phase 12 iteration): a genuinely
  // excellent, business-specific caption often doesn't restate the
  // business's own name in the caption body -- the account IS the
  // business, and real social captions commonly carry that identity in a
  // hashtag instead ("#CoastalKitchen"). Checking hashtags too (compacted,
  // since a hashtag is one CamelCase token like "#CoastalKitchen" with no
  // spaces) avoids penalizing that entirely normal, professional pattern.
  const businessNameLower = input.businessName.toLowerCase();
  const businessNameCompact = businessNameLower.replace(/[^a-z0-9]/g, "");
  const hashtagsLower = (input.hashtags ?? []).map((tag) => tag.toLowerCase());
  const nameMentioned =
    caption.toLowerCase().includes(businessNameLower) ||
    title.toLowerCase().includes(businessNameLower) ||
    (businessNameCompact.length > 0 && hashtagsLower.some((tag) => tag.replace(/[^a-z0-9]/g, "").includes(businessNameCompact)));
  const factTerms = (input.verifiedFacts ?? []).map((f) => f.split(":").slice(1).join(":").trim()).filter(Boolean);
  const referencedFacts = factTerms.filter((term) => tokenWords(term).some((word) => word.length > 3 && caption.toLowerCase().includes(word)));
  const generic = genericAdjectiveScore(caption);

  let businessSpecificity = DIMENSION_WEIGHTS.businessSpecificity;
  if (!nameMentioned) businessSpecificity -= 5;
  if (factTerms.length > 0 && referencedFacts.length === 0) businessSpecificity -= 5;
  businessSpecificity -= Math.min(10, generic.weight * 2);
  businessSpecificity = Math.max(0, businessSpecificity);
  if (businessSpecificity === 0) hardFailures.push({ reason: "LOW_BUSINESS_SPECIFICITY", detail: "caption references nothing specific to this business (no name, no verified facts, generic language throughout)" });

  const profile = getIndustryProfile(input.industry);
  // Same real-evidence reasoning as nameMentioned above: hashtags like
  // "#KeralaSeafood" or "#BridalStyling" are genuine industry-relevance
  // signal a human reader would credit, not filler to ignore.
  const industryHits = profile.relevanceVocabulary.filter((word) => caption.toLowerCase().includes(word) || hashtagsLower.some((tag) => tag.includes(word))).length;
  const conceptTokens = tokenWords(input.concept);
  const conceptOverlap = conceptTokens.filter((token) => token.length > 3 && caption.toLowerCase().includes(token)).length;
  // A caption doesn't need to literally contain its concept LABEL's words
  // ("dish spotlight") to genuinely be that concept -- real industry
  // vocabulary usage (2+ distinct hits) is itself strong, sufficient
  // evidence of relevance and earns full credit; concept-label overlap is
  // a smaller secondary signal used only when vocabulary hits are sparse.
  let industryRelevance = DIMENSION_WEIGHTS.industryRelevance;
  if (input.industry !== "generic") {
    if (industryHits > 0) industryRelevance = Math.min(DIMENSION_WEIGHTS.industryRelevance, 4 + industryHits * 3);
    else if (conceptOverlap > 0) industryRelevance = Math.min(DIMENSION_WEIGHTS.industryRelevance, conceptOverlap * 4);
    else industryRelevance = 0;
  }
  if (input.industry !== "generic" && industryHits === 0 && conceptOverlap === 0) {
    hardFailures.push({ reason: "LOW_INDUSTRY_RELEVANCE", detail: `no ${input.industry} industry vocabulary or concept language found -- this caption could belong to any business` });
  }

  const audienceTokens = input.audience ? tokenWords(input.audience) : [];
  const audienceOverlap = audienceTokens.filter((t) => t.length > 3 && caption.toLowerCase().includes(t)).length;
  let personalization = DIMENSION_WEIGHTS.personalization;
  if (referencedFacts.length === 0 && factTerms.length > 0) personalization -= 5;
  if (audienceTokens.length && audienceOverlap === 0) personalization -= 3;
  personalization -= Math.min(10, generic.weight * 1.5);
  personalization = Math.max(0, Math.round(personalization));

  let brandConsistency = DIMENSION_WEIGHTS.brandConsistency;
  if (forbiddenHit) brandConsistency = 0;
  else if (input.brandTone?.length) {
    const toneOverlap = input.brandTone.some((tone) => caption.toLowerCase().includes(tone.toLowerCase()));
    if (!toneOverlap) brandConsistency -= 2; // soft signal only -- tone is genuinely hard to detect lexically
  }

  let creativeOriginality = DIMENSION_WEIGHTS.creativeOriginality;
  if (repetition.isDuplicate) creativeOriginality = 0;
  else creativeOriginality -= Math.round(repetition.similarity * DIMENSION_WEIGHTS.creativeOriginality);
  creativeOriginality = Math.max(0, creativeOriginality);

  const words = tokenWords(caption);
  const sentences = caption.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const avgWordsPerSentence = sentences.length ? words.length / sentences.length : words.length;
  // Digit-containing tokens (2BHK, 24x7, iOS17) are abbreviations/codes, not
  // shouting -- real estate copy legitimately says "2BHK"/"3BHK" constantly.
  // A quoted word (comment 'VISIT', comment "START") is a deliberate,
  // common engagement-CTA mechanic, not shouting -- found against REAL
  // generated output using exactly this pattern. Short (<=5 letter)
  // all-caps tokens are usually real place/org acronyms (ITPL, NYC, GST),
  // also found in real output, not emphasis. Only pure-letter, unquoted,
  // longer all-caps words are counted, and only 3+ of them (one incidental
  // acronym must not read as "shouting").
  const capsWords = caption.split(/\s+/).filter((raw) => {
    const w = raw.replace(/^['"“‘]+|['"”’.,!?]+$/g, "");
    if (/\d/.test(w) || w.length <= 5) return false;
    const isQuoted = /['"“”‘’]/.test(raw);
    return !isQuoted && w === w.toUpperCase() && /[A-Z]/.test(w);
  }).length;
  const exclamations = (caption.match(/!/g) ?? []).length;
  let readability = DIMENSION_WEIGHTS.readability;
  if (avgWordsPerSentence > 28) readability -= 2; // one sprawling run-on sentence
  if (capsWords > 1) readability -= 2; // shouting
  if (exclamations > 2) readability -= 1;
  readability = Math.max(0, readability);

  let copyQuality = DIMENSION_WEIGHTS.copyQuality;
  if (caption.length < 40) copyQuality -= 3; // too thin to say anything real
  if (caption.length > 900) copyQuality -= 2; // unlikely to be genuinely platform-appropriate
  copyQuality -= Math.min(6, generic.hits);
  copyQuality = Math.max(0, copyQuality);

  let ctaRelevance = DIMENSION_WEIGHTS.ctaRelevance;
  const hasCta = hasCtaVerb(caption) || hasCtaVerb(input.hashtags.join(" "));
  if (!hasCta) ctaRelevance = 0;

  let factualAccuracy = DIMENSION_WEIGHTS.factualAccuracy;
  if (unsupportedClaims.length) factualAccuracy = 0;

  // --- GENERIC_COPY: contextual-specificity check (Phase H), independent of
  // the exact-phrase placeholder ban list -- a caption can be entirely free
  // of banned PHRASES and still be substance-free filler. ---
  const genericDensity = words.length ? generic.hits / words.length : 0;
  if (businessSpecificity <= 5 && (genericDensity > 0.03 || generic.hits >= 2)) {
    hardFailures.push({ reason: "GENERIC_COPY", detail: "reads as generic marketing filler with little to no business-specific substance" });
  }

  const breakdown: QualityScoreBreakdown = {
    businessSpecificity,
    personalization,
    industryRelevance,
    brandConsistency,
    creativeOriginality,
    copyQuality,
    visualQuality: VISUAL_QUALITY_NEUTRAL_SCORE,
    factualAccuracy,
    ctaRelevance,
    readability,
  };

  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const hasHardFailure = hardFailures.length > 0;
  const score = hasHardFailure ? 0 : Math.round(Math.max(0, Math.min(100, rawScore)));
  const passed = !hasHardFailure && score >= QUALITY_PASS_THRESHOLD;

  for (const failure of hardFailures) diagnostics.push(`[${failure.reason}] ${failure.detail}`);
  if (!hasHardFailure && !passed) diagnostics.push(`Score ${score} is below the ${QUALITY_PASS_THRESHOLD} pass threshold.`);
  diagnostics.push("visualQuality is a neutral placeholder pending live visual generation -- not a real visual assessment.");

  return { score, passed, breakdown, hardFailures, diagnostics, visualQualityPending: true };
}
