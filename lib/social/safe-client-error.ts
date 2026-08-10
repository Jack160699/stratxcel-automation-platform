const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const FRAMEWORK_LEAK =
  /server components render|digest\s*[:=]|specific message is omitted|next\.js|stack trace|postgres|supabase|schema cache|claim_social_agent_action|storage_path|ECONNREFUSED|PGRST\d+/i;

/**
 * Map any thrown value into a short, owner-safe message.
 * Framework digests, SQL, UUIDs, and storage paths stay out of the UI.
 */
export function toSafeClientError(
  err: unknown,
  fallback = "Something went wrong while refreshing this review."
): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw.trim()) return fallback;
  if (FRAMEWORK_LEAK.test(raw)) return fallback;
  const cleaned = raw.replace(UUID, "[hidden]").replace(/\s+/g, " ").trim();
  if (!cleaned || FRAMEWORK_LEAK.test(cleaned)) return fallback;
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned;
}

export function isMissingClaimRpcError(message: string): boolean {
  return /claim_social_agent_action/i.test(message) && /schema cache|could not find the function|PGRST202/i.test(message);
}
