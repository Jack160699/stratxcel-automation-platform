/**
 * Pure, dependency-free parser for the Agent Factory dispatch prefix
 * ("AGENT:<key>: <message>"). Deliberately zero imports so it's directly
 * runnable via plain `node --experimental-strip-types` without dragging in
 * any Supabase-typed module (the same reason growth-analysis-outcome.ts and
 * publish-outcome-classify.ts are split out this way). See agent-dispatch.ts
 * for the real DB-backed resolver that wraps this.
 */
const DISPATCH_PREFIX = /^agent\s*:\s*([a-z0-9_-]{2,40})\s*:\s*([\s\S]+)$/i;

export interface ParsedAgentDispatchPrefix {
  key: string;
  remainder: string;
}

/** Returns null when the text doesn't match the "AGENT:<key>: <msg>" shape
 *  at all, OR matches the key but has no real message after it (an empty
 *  remainder falls through to the normal agent turn, unrouted, rather than
 *  being treated as a valid dispatch with nothing to say). Anchored to the
 *  start of the trimmed text -- a message that merely CONTAINS "agent:"
 *  mid-sentence must never match, same discipline as command-parser.ts. */
export function parseAgentDispatchPrefix(rawText: string): ParsedAgentDispatchPrefix | null {
  const match = DISPATCH_PREFIX.exec(rawText.trim());
  if (!match) return null;
  const key = match[1]!.toLowerCase();
  const remainder = match[2]!.trim();
  if (!remainder) return null;
  return { key, remainder };
}
