// Pure, dependency-free caption/hashtag presentation helpers (mirrors
// activity-labels.ts / publish-outcome-classify.ts) so they're unit
// testable standalone. Presentation only — never mutates the stored
// caption/hashtags the provider actually publishes.

/**
 * When a generated caption already ends with the same hashtags that are
 * also stored in the structured `hashtags` array, the "Ready to publish"
 * card would otherwise show them twice: once embedded in the caption text,
 * once as the separate hashtag row. This strips a trailing run of "#tag"
 * tokens from the caption for DISPLAY only when every one of those tokens
 * is already present in `hashtags` — real caption content is never touched,
 * and if the trailing tokens don't fully match the structured hashtags
 * (e.g. only some of them do, or they're unrelated) the caption is left
 * exactly as written, since stripping real content is worse than a rare
 * duplicate.
 */
export function dedupeCaptionForPreview(caption: string, hashtags: string[]): string {
  if (!caption || hashtags.length === 0) return caption;
  const canonical = new Set(hashtags.map((tag) => tag.replace(/^#/, "").toLowerCase()));
  const trimmed = caption.replace(/\s+$/, "");
  const trailingMatch = trimmed.match(/(?:\r?\n\s*)*((?:#[\p{L}\p{N}_]+[ \t]*)+)$/u);
  if (!trailingMatch) return caption;
  const trailingBlock = trailingMatch[1].trim();
  const trailingTags = trailingBlock.split(/\s+/).map((tag) => tag.replace(/^#/, "").toLowerCase());
  if (trailingTags.length === 0 || !trailingTags.every((tag) => canonical.has(tag))) return caption;
  const withoutTrailing = trimmed.slice(0, trimmed.length - trailingMatch[0].length);
  return withoutTrailing.replace(/\s+$/, "");
}
