import crypto from "node:crypto";
import type { AgentPrincipal } from "@stratxcel/agent-core";
import type { ServiceClient } from "@stratxcel/whatsapp";
import type { OwnerContext } from "./db-context.ts";
import { ATTACHMENT_BUCKET, type AgentAttachmentRow } from "./repositories/agent-attachments.ts";
import { ensureMediaAssetForAttachment } from "./repositories/media-assets.ts";
import { acceptAgentMission, approveAgentAction, rejectAgentAction, runAgentTurn } from "./agent/orchestrator.ts";
import { createAgentSession, getSessionDetail } from "./repositories/agent.ts";
import { getAutomationSettings } from "./repositories/automation.ts";
import { transcribeVoiceNote } from "../owner-brain/voice/transcription.ts";

export { signWhatsAppSocialHandoff, verifyWhatsAppSocialHandoff } from "./whatsapp-handoff-token.ts";
import { signWhatsAppSocialHandoff, verifyWhatsAppSocialHandoff, type WhatsAppSocialOperation } from "./whatsapp-handoff-token.ts";

function ownerContext(supabase: ServiceClient, principal: AgentPrincipal): OwnerContext {
  return { ok: true, ownerId: principal.authUserId, email: null, supabase: supabase as OwnerContext["supabase"] };
}
function safeName(kind: string, mime: string) {
  const ext = mime.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "bin";
  return `whatsapp-${kind}-${Date.now()}.${ext.replace(/[^a-z0-9]/gi, "")}`;
}
type UserLanguage = "en" | "hi" | "hinglish";
export function detectWhatsAppUserLanguage(text: string): UserLanguage {
  if (/[\u0900-\u097f]/.test(text)) return "hi";
  if (/\b(?:iska|isko|bana|karo|karna|liye|aur|jahan|sahi|lage|bhejo|dikhao|nahi|haan)\b/i.test(text)) return "hinglish";
  return "en";
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string; name: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v20.0";
  if (!token) throw new Error("WhatsApp media credential is not configured");
  const metadata = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!metadata.ok) throw new Error(`WhatsApp media lookup failed (${metadata.status})`);
  const info = await metadata.json() as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url || !info.mime_type) throw new Error("WhatsApp media metadata was incomplete");
  if ((info.file_size ?? 0) > 100 * 1024 * 1024) throw new Error("WhatsApp media is too large");
  const media = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, redirect: "error" });
  if (!media.ok) throw new Error(`WhatsApp media download failed (${media.status})`);
  const bytes = Buffer.from(await media.arrayBuffer());
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error("WhatsApp media size is invalid");
  return { bytes, mimeType: info.mime_type, name: safeName("media", info.mime_type) };
}

async function persistAttachment(ctx: OwnerContext, sessionId: string, input: { bytes: Buffer; mimeType: string; name: string }): Promise<AgentAttachmentRow> {
  const id = crypto.randomUUID();
  const path = `${ctx.ownerId}/${sessionId}/${id}-${input.name}`;
  const readable = input.mimeType.startsWith("text/") || input.mimeType === "application/json";
  const { error: uploadError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).upload(path, input.bytes, { contentType: input.mimeType, upsert: false });
  if (uploadError) throw new Error(`Could not store WhatsApp media: ${uploadError.message}`);
  const { data, error } = await ctx.supabase.from("social_agent_attachments").insert({
    id, owner_id: ctx.ownerId, session_id: sessionId, storage_path: path, original_name: input.name,
    mime_type: input.mimeType, size_bytes: input.bytes.length, processing_status: readable ? "EXTRACTED" : "STORED_UNREADABLE",
    extracted_text: readable ? input.bytes.toString("utf8").slice(0, 100000) : null,
  }).select("*").single();
  if (error || !data) { await ctx.supabase.storage.from(ATTACHMENT_BUCKET).remove([path]); throw new Error(error?.message ?? "Could not record WhatsApp attachment"); }
  let row = data as AgentAttachmentRow;
  if (["image/png", "image/jpeg", "image/webp", "video/mp4"].includes(input.mimeType)) {
    const asset = await ensureMediaAssetForAttachment(ctx, row);
    row = { ...row, media_asset_id: asset.id };
  }
  return row;
}

export interface WhatsAppSocialResult { sessionId: string; text: string; previewUrl?: string; approveToken?: string; editToken?: string; cancelToken?: string; shadowMode: boolean }

export async function runWhatsAppSocialMission(input: {
  supabase: ServiceClient; principal: AgentPrincipal; normalizedPhone: string; phoneBindingId: string;
  providerMessageId: string; kind: string; body: string; mediaId?: string | null; mimeType?: string | null;
}): Promise<WhatsAppSocialResult> {
  if (input.principal.kind === "client") {
    const { data: memberships } = await input.supabase.from("tenant_members").select("tenant_id").eq("user_id", input.principal.authUserId);
    if ((memberships ?? []).length !== 1 || memberships?.[0]?.tenant_id !== input.principal.tenantId) {
      throw new Error("Client Social Copilot context is ambiguous; select one workspace in Stratxcel before using WhatsApp.");
    }
  }
  const ctx = ownerContext(input.supabase, input.principal);
  const existingMessage = await input.supabase.from("social_whatsapp_inbound_messages").select("session_id").eq("provider_message_id", input.providerMessageId).maybeSingle();
  if (existingMessage.data?.session_id) return summarizeWhatsAppMission(ctx, input.principal, existingMessage.data.session_id as string);

  const mediaOnly = input.kind !== "text" && !input.body.trim();
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data: recent } = mediaOnly ? await input.supabase.from("social_whatsapp_sessions").select("session_id,last_media_at").eq("auth_user_id", input.principal.authUserId).eq("normalized_phone", input.normalizedPhone).gte("last_media_at", cutoff).order("last_media_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
  const grouped = Boolean(recent?.session_id);
  const sessionId = recent?.session_id as string | undefined ?? await createAgentSession(ctx, input.kind === "text" ? input.body.slice(0, 60) : input.kind === "image" ? "WhatsApp image ideas" : "WhatsApp social mission");
  let attachment: AgentAttachmentRow | null = null;
  let transcript = "";
  if (input.mediaId) {
    const media = await downloadWhatsAppMedia(input.mediaId);
    if ((input.kind === "voice" || input.kind === "audio") && media.mimeType.startsWith("audio/")) {
      transcript = (await transcribeVoiceNote(media.bytes.toString("base64"), media.mimeType)).text;
    }
    attachment = await persistAttachment(ctx, sessionId, { ...media, name: safeName(input.kind, media.mimeType) });
  }
  const mission = input.body.trim() || transcript.trim() || (grouped
    ? "Analyze these recently sent images together as one ordered set. Suggest the best grouped social use, with concise choices, and do not publish before I choose."
    : input.kind === "image" ? "Analyze this image silently. Show concise choices for Social post, Carousel, Product update, or Suggest best use. Default to English. Do not publish before I choose."
    : "Review this attachment and suggest the best social use. Keep the answer concise.");
  const accepted = await acceptAgentMission(ctx, sessionId, mission, attachment ? [attachment.id] : []);
  const language = detectWhatsAppUserLanguage(input.body.trim() || transcript.trim());
  await input.supabase.from("social_whatsapp_sessions").upsert({
    session_id: sessionId, auth_user_id: input.principal.authUserId, tenant_id: input.principal.tenantId,
    principal_type: input.principal.kind, normalized_phone: input.normalizedPhone, phone_binding_id: input.phoneBindingId,
    last_provider_message_id: input.providerMessageId, last_media_at: input.kind === "image" ? new Date().toISOString() : null, language, updated_at: new Date().toISOString(),
  }, { onConflict: "session_id" });
  await input.supabase.from("social_whatsapp_inbound_messages").insert({ provider_message_id: input.providerMessageId, session_id: sessionId, attachment_id: attachment?.id ?? null, auth_user_id: input.principal.authUserId, tenant_id: input.principal.tenantId, message_kind: input.kind, grouped });
  await runAgentTurn(ctx, accepted.sessionId, accepted.runId);
  return summarizeWhatsAppMission(ctx, input.principal, sessionId);
}

export async function summarizeWhatsAppMission(ctx: OwnerContext, principal: AgentPrincipal, sessionId: string): Promise<WhatsAppSocialResult> {
  const detail = await getSessionDetail(ctx, sessionId);
  const pending = detail.actions.filter((action) => action.status === "PROPOSED");
  const platforms = [...new Set(pending.map((action) => String(action.input.platform || "")).filter(Boolean))];
  const settings = await getAutomationSettings(ctx);
  const { data: channel } = await ctx.supabase.from("social_whatsapp_sessions").select("language").eq("session_id", sessionId).maybeSingle();
  const language = (channel?.language ?? "en") as UserLanguage;
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://stratxcel.in";
  const tokenInput = (op: WhatsAppSocialOperation) => signWhatsAppSocialHandoff({ sub: principal.authUserId, tenant: principal.tenantId, session: sessionId, op });
  const previewToken = tokenInput("preview");
  const previewUrl = `${base}/api/social/copilot/whatsapp-handoff?token=${encodeURIComponent(previewToken)}`;
  const platformLine = platforms.length ? `\n${platforms.map((value) => value[0].toUpperCase() + value.slice(1)).join(" · ")}` : "";
  const copy = language === "hi"
    ? { ready: `${pending.length} पोस्ट समीक्षा के लिए तैयार`, view: "आपका सोशल कोपायलट मिशन देखने के लिए तैयार है।", shadow: "\nशैडो मोड: बाहर कुछ भी प्रकाशित नहीं होगा।" }
    : language === "hinglish"
      ? { ready: `${pending.length} post review ke liye ready`, view: "Aapka Social Copilot mission review ke liye ready hai.", shadow: "\nShadow Mode: externally kuch publish nahi hoga." }
      : { ready: `${pending.length} post${pending.length === 1 ? "" : "s"} ready`, view: "Your Social Copilot mission is ready to view.", shadow: "\nShadow Mode: nothing will be published externally." };
  const text = pending.length ? `${copy.ready}${platformLine}${settings.shadow_mode ? copy.shadow : ""}` : copy.view;
  return { sessionId, text, previewUrl, approveToken: tokenInput("approve"), editToken: tokenInput("edit"), cancelToken: tokenInput("cancel"), shadowMode: settings.shadow_mode };
}

export async function decideWhatsAppSocialMission(input: { supabase: ServiceClient; principal: AgentPrincipal; token: string; operation: "approve" | "cancel" }) {
  const claims = verifyWhatsAppSocialHandoff(input.token, { sub: input.principal.authUserId, operation: input.operation });
  if (!claims || claims.tenant !== input.principal.tenantId) throw new Error("This action link is invalid or expired");
  const ctx = ownerContext(input.supabase, input.principal);
  const mapping = await input.supabase.from("social_whatsapp_sessions").select("session_id,language").eq("session_id", claims.session).eq("auth_user_id", input.principal.authUserId).maybeSingle();
  if (!mapping.data) throw new Error("Mission not found for this WhatsApp identity");
  const language = (mapping.data.language ?? "en") as UserLanguage;
  const detail = await getSessionDetail(ctx, claims.session);
  const pending = detail.actions.filter((action) => action.status === "PROPOSED");
  if (!pending.length) return { sessionId: claims.session, alreadyResolved: true, text: language === "hi" ? "यह मिशन पहले ही पूरा हो चुका है।" : language === "hinglish" ? "Yeh mission pehle hi resolve ho chuka hai." : "This mission was already resolved." };
  for (const action of pending) {
    if (input.operation === "approve") await approveAgentAction(ctx, action.id);
    else await rejectAgentAction(ctx, action.id);
  }
  if (input.operation === "cancel") return { sessionId: claims.session, alreadyResolved: false, text: language === "hi" ? "रद्द किया गया। कुछ भी प्रकाशित नहीं हुआ।" : language === "hinglish" ? "Cancel ho gaya. Kuch bhi publish nahi hua." : "Cancelled. Nothing was published." };
  const after = await getSessionDetail(ctx, claims.session);
  const settings = await getAutomationSettings(ctx);
  const settled = after.actions.filter((action) => pending.some((item) => item.id === action.id));
  const lines = settled.map((action) => {
    const platform = String(action.input.platform || "Post");
    return `${platform[0].toUpperCase()}${platform.slice(1)} ${action.status === "FAILED" ? "failed" : "✓"}`;
  });
  if (settings.shadow_mode) return { sessionId: claims.session, alreadyResolved: false, text: `${language === "hi" ? "शैडो रन पूरा हुआ" : language === "hinglish" ? "Shadow run complete" : "Shadow run complete"}:\n${lines.join("\n")}\n${language === "hi" ? "बाहर कुछ भी प्रकाशित नहीं हुआ।" : language === "hinglish" ? "Externally kuch publish nahi hua." : "Nothing was published externally."}` };
  const failed = settled.some((action) => action.status === "FAILED");
  return { sessionId: claims.session, alreadyResolved: false, text: `${failed ? "Publishing result" : "Published"}:\n${lines.join("\n")}` };
}
