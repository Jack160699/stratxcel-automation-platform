const OPT_OUT_PATTERNS = [/^stop$/i, /^unsubscribe$/i, /^opt\s*out$/i, /^cancel$/i, /do not (contact|message|text) me/i];

/**
 * Pure and deliberately conservative: matches the legacy bot's stated
 * "opt-out handling" capability (see docs/discovery — ai-automation-system
 * backend/app/whatsapp/) at the level of exact-word commands, not fuzzy
 * intent detection. A false negative (missed opt-out) just means the
 * message flows into normal processing; a false positive (treating a real
 * question as an opt-out) would incorrectly silence a customer, which is
 * the worse failure mode — hence narrow, anchored patterns over broad
 * keyword-anywhere-in-string matching.
 */
export function isOptOutMessage(body: string): boolean {
  const trimmed = body.trim();
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(trimmed));
}
