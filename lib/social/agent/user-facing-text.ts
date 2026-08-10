const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const INTERNAL_ID_LINE = /^\s*(?:[-*]\s*)?(?:master|variant|account|media\s+asset|attachment|publishing\s+job|database)\s+id\s*[:=-].*$/gim;
const INTERNAL_TOOL_NAME = /\b(?:inspect_accounts|inspect_health|get_performance|inspect_brand|ingest_media|create_content_item|create_content_variant|attach_media_to_content|schedule_post)\b/g;
const APPLE_METADATA = /(?:^|\n)[^\n]{0,160}(?:com\.apple\.(?:kit|pasteboard|metadata)|dyn\.[a-z0-9.-]{12,}|bplist00)[^\n]*(?=\n|$)/gi;
const STRUCTURED_WRAPPER = /(?:^|\n)\s*(?:provider(?:Response)?|tool(?:Call|Result)?|function(?:Call|Response)?|internal(?:Metadata|Reference))\s*[:=]\s*(?:\{[^\n]*\}|\[[^\n]*\]|[^\n]+)(?=\n|$)/gi;

/** Defense-in-depth for the main conversation; telemetry and trusted action payloads remain untouched. */
export function sanitizeUserFacingText(value: string): string {
  return value
    .replace(APPLE_METADATA, "")
    .replace(STRUCTURED_WRAPPER, "")
    .replace(INTERNAL_ID_LINE, "")
    .replace(UUID, "[internal reference hidden]")
    .replace(INTERNAL_TOOL_NAME, "internal workflow step")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
