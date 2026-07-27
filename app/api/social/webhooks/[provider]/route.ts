import { NextResponse, type NextRequest } from "next/server";
import { isValidProvider } from "@/lib/social/providers";
import { verifyMetaSignature, getWebhookAppSecret } from "@/lib/social/webhook-signature";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { recordWebhookEvent } from "@/lib/social/repositories/system";

/**
 * GET /api/social/webhooks/:provider — Meta's subscription verification
 * challenge. Meta calls this once when you register/update a webhook
 * subscription in the App Dashboard; it must echo back hub.challenge
 * verbatim if hub.verify_token matches, or the subscription is rejected.
 * https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isValidProvider(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "META_WEBHOOK_VERIFY_TOKEN not configured" }, { status: 503 });
  }
  if (mode !== "subscribe" || token !== expected || !challenge) {
    return NextResponse.json({ error: "verification failed" }, { status: 403 });
  }

  // Meta expects the raw challenge string as the entire response body, not JSON.
  return new NextResponse(challenge, { status: 200 });
}

/**
 * POST /api/social/webhooks/:provider — real event delivery. Every event is
 * persisted to social_webhook_events (stratxcel) regardless of whether
 * normalization below recognizes its shape, so nothing is silently dropped.
 * Runs via service-role: a webhook delivery has no user session, matching
 * the schema's own SELECT-only admin policy on this table.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isValidProvider(provider)) return NextResponse.json({ error: "unknown provider" }, { status: 404 });

  const rawBody = await req.text();
  const appSecret = getWebhookAppSecret(provider);
  const signatureValid = appSecret ? verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret) : false;

  const service = createSupabaseServiceClient();

  if (!signatureValid) {
    // Recorded (as IGNORED, via recordWebhookEvent's own signatureValid=false
    // branch) so a spoofing attempt is visible in System, but never
    // processed into the Inbox.
    await recordWebhookEvent(service, { provider, payload: safeParse(rawBody), signatureValid: false });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = safeParse(rawBody);
  const externalId = extractExternalId(payload);

  await recordWebhookEvent(service, { provider, eventType: payload.object as string | undefined, externalId, payload, signatureValid: true });

  try {
    await normalizeIntoInbox(service, provider, payload);
  } catch (err) {
    // Normalization failures never fail the webhook response — Meta retries
    // aggressively on non-2xx, and the raw event is already durably stored
    // above regardless of whether normalization understood its shape.
    console.error(`webhook normalization failed for ${provider}:`, err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true });
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractExternalId(payload: Record<string, unknown>): string | undefined {
  const entry = (payload.entry as Array<Record<string, unknown>> | undefined)?.[0];
  return (entry?.id as string | undefined) ?? undefined;
}

/**
 * Best-effort normalization for the common Meta "comments" change shape
 * (Instagram/Facebook). Threads and DM/messaging payloads have different
 * shapes not covered here yet — those events still land in
 * social_webhook_events untouched, ready to extend once real payloads from
 * an active subscription are available to shape this against.
 */
async function normalizeIntoInbox(service: ReturnType<typeof createSupabaseServiceClient>, provider: string, payload: Record<string, unknown>) {
  const entries = (payload.entry as Array<Record<string, unknown>> | undefined) ?? [];
  for (const entry of entries) {
    const changes = (entry.changes as Array<Record<string, unknown>> | undefined) ?? [];
    for (const change of changes) {
      if (change.field !== "comments") continue;
      const value = change.value as Record<string, unknown> | undefined;
      if (!value) continue;

      const externalCommentId = value.id as string | undefined;
      const from = value.from as Record<string, unknown> | undefined;
      const text = value.text as string | undefined;
      if (!externalCommentId || !text) continue;

      // Idempotency: skip if we've already created a conversation for this
      // exact external comment id.
      const { data: existing } = await service
        .from("social_conversations")
        .select("id")
        .eq("external_conversation_id", externalCommentId)
        .maybeSingle();
      if (existing) continue;

      const { data: conversation } = await service
        .from("social_conversations")
        .insert({
          provider,
          external_conversation_id: externalCommentId,
          external_author_id: (from?.id as string | undefined) ?? null,
          author_name: (from?.username as string | undefined) ?? (from?.name as string | undefined) ?? null,
          source: "COMMENT",
          context: { raw: value },
          status: "OPEN",
        })
        .select("id")
        .single();

      if (conversation) {
        await service.from("social_messages").insert({
          conversation_id: conversation.id,
          direction: "INBOUND",
          author: (from?.username as string | undefined) ?? null,
          content: text,
          external_message_id: externalCommentId,
        });
      }
    }
  }
}

export const dynamic = "force-dynamic";
