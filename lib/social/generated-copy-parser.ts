/**
 * Parses the model's copy response for Package Autopilot. Extracted from
 * package-autopilot.ts so it's importable standalone: that file pulls in
 * repositories/publishing.ts, which imports "../../supabase/service"
 * without a .ts extension -- Next.js's bundler resolves that fine, but
 * plain `node --experimental-strip-types` (used by this repo's test suite
 * and by scripts/quality-campaign-generate.ts) cannot, so importing
 * package-autopilot.ts at all pulls in an unresolvable module graph (see
 * package-autopilot-producer.test.ts's header comment for the established
 * precedent of extracting for exactly this reason).
 *
 * Never throws and no longer reads contentPillar or objective from the
 * model at all -- the CreativeBrief already decides both deterministically
 * before generation (Phase C: strategy is decided BEFORE copy, never
 * delegated to the copy-writing call). A malformed/empty response simply
 * produces empty fields, which scoreGeneratedContent's MALFORMED_STRUCTURE
 * check catches through the SAME quality gate every other failure goes
 * through -- one diagnosis path, not two.
 */

export interface GeneratedCopy {
  title: string;
  masterIdea: string;
  caption: string;
  hashtags: string[];
}

export function parseGeneratedCopy(text: string): GeneratedCopy {
  const match = text.match(/\{[\s\S]*\}/);
  let parsed: Record<string, unknown> = {};
  if (match) {
    try {
      parsed = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const caption = typeof parsed.caption === "string" ? parsed.caption.trim() : "";
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const masterIdea = typeof parsed.masterIdea === "string" ? parsed.masterIdea.trim() : "";
  const hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).map((tag) => tag.replace(/^#/, "")).filter(Boolean) : [];
  return { title: title || caption.slice(0, 60), masterIdea: masterIdea || caption, caption, hashtags };
}
