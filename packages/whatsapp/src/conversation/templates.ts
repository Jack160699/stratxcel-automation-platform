import type { CompiledMission } from "@stratxcel/missions";

/**
 * Deterministic, template-based response drafting — not an LLM call.
 * Matches this platform's general "no network dependency for v1
 * classification/response" approach (see @stratxcel/missions' compiler).
 * This is intentionally generic and not a port of the legacy bot's actual
 * copy (backend/app/whatsapp/copy_variants.py, quick_reply_templates.py) —
 * porting the real, brand-voiced copy is listed as an open item in
 * WHATSAPP_PARITY_REPORT.md, not silently approximated here.
 */
export function composeProposedResponse(compiled: CompiledMission): string {
  if (!compiled.matched) {
    return "Thanks for reaching out! Someone from our team will get back to you shortly to understand what you need.";
  }
  return `Thanks for reaching out about ${compiled.serviceKey.replace(/_/g, " ")}. We'll follow up shortly with next steps.`;
}
