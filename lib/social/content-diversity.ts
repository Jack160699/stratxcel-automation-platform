/**
 * Creative memory / diversity engine (build brief Section 11): the feed
 * must read as one coherent tenant's content, not a template stamped out
 * repeatedly. Pure, deterministic, no AI/DB call -- the caller is
 * responsible for reading recent history (package-autopilot.ts already
 * does this for content_pillar; this module generalizes the same idea to
 * concept/hook/CTA/format/visual-treatment and adds real similarity
 * detection, not just exact-string matching).
 */

export interface CreativeFingerprint {
  contentPillar?: string;
  concept?: string;
  hookStyle?: string;
  cta?: string;
  format?: string;
  visualTreatment?: string;
  /** The actual generated caption/headline text, for near-duplicate detection. */
  captionText?: string;
}

/** Lowercased, punctuation-stripped token set -- used for cheap, dependency-free similarity. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2) // drop stopword-length noise (a, of, to, ...)
  );
}

/** Jaccard similarity of two token sets: 0 (nothing shared) to 1 (identical vocabulary). */
export function textSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (!setA.size || !setB.size) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Above this Jaccard similarity, two captions are treated as the same
 * concept restated, not genuine variety -- calibrated so two posts about
 * the same pillar with different specifics stay below it, but a near
 * copy-paste (only the business name changed) trips it. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

export interface RepetitionCheck {
  isDuplicate: boolean;
  reason: string | null;
  mostSimilarIndex: number | null;
  similarity: number;
}

/** Checks a candidate against the tenant's recent creative history for the
 * three cheapest, highest-signal exact-repeat cases (pillar, concept, CTA
 * hard-repeated back to back) plus caption-text near-duplication. Returns a
 * specific, diagnosable reason -- never a bare boolean -- per the campaign's
 * "diagnosable failures, not generic quality gate failed" requirement. */
export function checkRepetition(candidate: CreativeFingerprint, recent: CreativeFingerprint[]): RepetitionCheck {
  if (candidate.concept && recent.length && recent[0]?.concept === candidate.concept) {
    return { isDuplicate: true, reason: `same creative concept as the immediately preceding post ("${candidate.concept}")`, mostSimilarIndex: 0, similarity: 1 };
  }
  if (candidate.cta && recent.length && recent[0]?.cta === candidate.cta && candidate.concept === recent[0]?.concept) {
    return { isDuplicate: true, reason: `same CTA and concept as the immediately preceding post`, mostSimilarIndex: 0, similarity: 1 };
  }

  let best = { index: -1, score: 0 };
  if (candidate.captionText) {
    recent.forEach((entry, index) => {
      if (!entry.captionText) return;
      const score = textSimilarity(candidate.captionText!, entry.captionText);
      if (score > best.score) best = { index, score };
    });
  }
  if (best.score >= DUPLICATE_SIMILARITY_THRESHOLD) {
    return {
      isDuplicate: true,
      reason: `caption text is ${Math.round(best.score * 100)}% similar to a recent post -- reads as the same content restated`,
      mostSimilarIndex: best.index,
      similarity: best.score,
    };
  }

  return { isDuplicate: false, reason: null, mostSimilarIndex: best.index >= 0 ? best.index : null, similarity: best.score };
}

/** Builds the comparable visual-fingerprint string for a Creative
 * Treatment (Premium Creative Intelligence brief Section 14): diversity
 * must cover composition/subject/camera/format, not just caption text --
 * two posts with completely different captions but the same "subject
 * centered, 35mm, soft key light" visual structure still read as the same
 * template repeated. */
export function visualFingerprintFromTreatment(treatment: {
  subject: string;
  composition: string;
  camera: string;
  environment: string;
  format?: string;
}): string {
  return [treatment.subject, treatment.composition, treatment.camera, treatment.environment, treatment.format ?? ""].join(" ");
}

export interface VisualRepetitionCheck {
  isDuplicate: boolean;
  reason: string | null;
  mostSimilarIndex: number | null;
  similarity: number;
}

/** Same Jaccard-similarity mechanism as caption checkRepetition, applied to
 * visual-structure fingerprints instead of caption text -- catches
 * near-duplicate compositions even when the copy is entirely different. */
export function checkVisualRepetition(candidateFingerprint: string, recentFingerprints: string[]): VisualRepetitionCheck {
  let best = { index: -1, score: 0 };
  recentFingerprints.forEach((fp, index) => {
    if (!fp) return;
    const score = textSimilarity(candidateFingerprint, fp);
    if (score > best.score) best = { index, score };
  });
  if (best.score >= DUPLICATE_SIMILARITY_THRESHOLD) {
    return {
      isDuplicate: true,
      reason: `visual composition (subject/camera/environment) is ${Math.round(best.score * 100)}% similar to a recent creative -- reads as the same shot repeated`,
      mostSimilarIndex: best.index,
      similarity: best.score,
    };
  }
  return { isDuplicate: false, reason: null, mostSimilarIndex: best.index >= 0 ? best.index : null, similarity: best.score };
}

/** Picks the candidate least represented in recent history, preferring one
 * that appears zero times over one that's merely less frequent. Ties break
 * on input order (stable, deterministic -- no randomness to keep tests and
 * production behavior reproducible). */
export function selectLeastRecentlyUsed<T extends string>(candidates: T[], recentValues: T[]): T {
  if (!candidates.length) throw new Error("selectLeastRecentlyUsed: no candidates provided");
  const counts = new Map<T, number>();
  for (const candidate of candidates) counts.set(candidate, 0);
  for (const value of recentValues) if (counts.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = candidates[0];
  let bestCount = counts.get(best) ?? 0;
  for (const candidate of candidates) {
    const count = counts.get(candidate) ?? 0;
    if (count < bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
