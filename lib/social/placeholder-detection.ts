/**
 * Placeholder/template-residue rejection (build brief Section 8, Definition
 * of Done Section 24: "Placeholder/template text is automatically
 * rejected"). A generated caption containing obvious AI/template
 * scaffolding is a hard-fail, never something a quality *score* merely
 * penalizes -- it must never reach REVIEW_REQUIRED or AUTO_PUBLISH.
 *
 * Two independent categories, checked in order so the caller can surface
 * the actual reason (matching this codebase's standing rule: a BLOCKED
 * item gets a specific, diagnosable last_error, never a generic one):
 *
 *  - Scaffolding markers ([insert ...], {{...}}, TODO, lorem ipsum, "your
 *    business name") -- these can NEVER be legitimate output regardless of
 *    business or industry.
 *  - The build brief's own named examples of generic filler copy (Section
 *    9) -- exact phrases a genuine, business-specific generator has no
 *    reason to ever produce, matched case-insensitively as substrings.
 */

const SCAFFOLDING_PATTERNS: RegExp[] = [
  /\[[^\]]{0,80}\]/, // [Add your custom words here], [Insert business name], [Add address]
  /\{\{[^}]{0,80}\}\}/, // {{business_name}}
  /\btodo\b/i,
  /\blorem ipsum\b/i,
  /\byour business name\b/i,
  /\binsert\s+(?:business|company|brand)\s+name\b/i,
  /\bplaceholder\b/i,
];

// Verbatim from the build brief's list of unacceptable default content
// (Section 8), extended with the campaign's Phase H "third-class generic AI
// copy" examples -- phrases carrying zero business-specific substance
// regardless of which business they're attached to.
const GENERIC_FILLER_PHRASES: string[] = [
  "contact us today",
  "amazing products",
  "quality you can trust",
  "best service in town",
  "don't miss out",
  "dont miss out",
  "we're excited to announce",
  "were excited to announce",
  "visit us today",
  "grow your business",
  "your trusted partner",
  "something special is waiting",
  "experience excellence",
];

/** Returns the exact offending substring if `text` contains placeholder/
 * template residue, or null if it's clean. Null is not a quality judgment
 * beyond this specific check -- it says nothing about whether the copy is
 * otherwise good. */
export function findPlaceholderOrFiller(text: string): string | null {
  for (const pattern of SCAFFOLDING_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  const lower = text.toLowerCase();
  for (const phrase of GENERIC_FILLER_PHRASES) {
    if (lower.includes(phrase)) return phrase;
  }
  return null;
}
