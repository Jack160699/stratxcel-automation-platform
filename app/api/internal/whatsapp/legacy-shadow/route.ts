import { getTenantServiceContext } from "@/lib/tenants/tenant-context";
import { ingestLegacyShadowEvent, verifyLegacyShadowRequest, type LegacyShadowEventInput } from "@stratxcel/whatsapp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal-only mirror endpoint for the existing verified WhatsApp bot
 * (Jack160699/ai-automation-system, live at bot.stratxcel.ai). NOT a
 * public webhook — it is authenticated with a dedicated shared secret
 * (WHATSAPP_LEGACY_SHADOW_SECRET), never a Meta credential, and requires a
 * valid HMAC signature over the raw body plus a bounded timestamp and an
 * unreplayed nonce (see verifyLegacyShadowRequest). No caller-supplied
 * tenantId, phoneNumberId, or direction is ever trusted for tenant
 * resolution — ingestLegacyShadowEvent resolves the tenant server-side
 * from the single pre-configured legacy binding and rejects anything that
 * doesn't match its phone_number_id.
 *
 * As of this task, nothing calls this endpoint in production: the small
 * additive hook that would call it from the legacy repo has been prepared
 * separately (not deployed — see feat/stratxcel-shadow-mirror) and is
 * pending explicit review, exactly per the task brief's requirement not to
 * silently deploy a change to the old repo's live webhook. This endpoint
 * exists, is authenticated, is idempotent, and is covered by tests; real
 * traffic through it is Left until that hook is reviewed and shipped.
 */
export async function POST(request: Request) {
  const rawBodyText = await request.text();
  const rawBody = Buffer.from(rawBodyText, "utf8");

  let body: (LegacyShadowEventInput & Record<string, unknown>) | null = null;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return Response.json({ error: "invalid_body" }, { status: 400 });

  const auth = verifyLegacyShadowRequest({
    rawBody,
    signatureHeader: request.headers.get("x-shadow-signature-256"),
    timestamp: Number(body.timestamp),
    nonce: String(body.nonce ?? ""),
  });
  if (!auth.ok) {
    // Never distinguish "not configured" from "bad signature" in the
    // response — both must look identical to an unauthenticated caller.
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const schemaError = validateShadowEventSchema(body);
  if (schemaError) return Response.json({ error: schemaError }, { status: 400 });

  const { supabase } = getTenantServiceContext();
  try {
    const outcome = await ingestLegacyShadowEvent(supabase, body as LegacyShadowEventInput);
    if (!outcome.ok) return Response.json({ error: outcome.reason }, { status: 422 });
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "ingest_failed" }, { status: 500 });
  }
}

const VALID_EVENT_TYPES = new Set([
  "inbound_message",
  "outbound_message",
  "delivery_status",
  "lead_update",
  "qualification_update",
  "human_handoff",
  "followup_scheduled",
  "payment_intent_detected",
  "bot_reply_decision",
  "owner_command",
]);
const MAX_BODY_TEXT_LENGTH = 8000;

function validateShadowEventSchema(body: Record<string, unknown>): string | null {
  if (typeof body.event_id !== "string" || body.event_id.length < 1 || body.event_id.length > 300) return "event_id required (string, 1-300 chars)";
  if (typeof body.event_type !== "string" || !VALID_EVENT_TYPES.has(body.event_type)) return "event_type invalid";
  if (typeof body.phone_number_id !== "string" || body.phone_number_id.length < 1) return "phone_number_id required";
  if (typeof body.occurred_at !== "string" || Number.isNaN(Date.parse(body.occurred_at))) return "occurred_at must be a valid ISO timestamp";
  if (body.contact_phone !== undefined && body.contact_phone !== null && typeof body.contact_phone !== "string") return "contact_phone must be a string";
  if (body.direction !== undefined && body.direction !== null && body.direction !== "inbound" && body.direction !== "outbound") return "direction invalid";
  if (typeof body.message_body === "string" && body.message_body.length > MAX_BODY_TEXT_LENGTH) return "message_body too large";
  if (body.is_owner_command !== undefined && typeof body.is_owner_command !== "boolean") return "is_owner_command must be boolean";
  if (body.observed_handoff !== undefined && body.observed_handoff !== null && typeof body.observed_handoff !== "boolean") return "observed_handoff must be boolean";
  return null;
}
