import crypto from "node:crypto";
import type { OwnerContext } from "../db-context";
import { type AgentActorContext, isTenantAgentContext } from "../agent-tenant-types.ts";
import { validateMediaMetadata } from "../media-validation.ts";

export const ATTACHMENT_BUCKET = "social-agent-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 100_000;

const TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  ...TEXT_MIME_TYPES,
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
]);

export interface AgentAttachmentRow {
  id: string;
  owner_id: string;
  session_id: string;
  message_id: string | null;
  run_id: string | null;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  processing_status: "UPLOADED" | "EXTRACTED" | "STORED_UNREADABLE" | "FAILED";
  extracted_text: string | null;
  media_asset_id: string | null;
  created_at: string;
}

function safeFileName(name: string) {
  const normalized = name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, "-");
  return normalized.slice(0, 120) || "attachment";
}

export function validateAttachmentMetadata(input: { name: string; sizeBytes: number; mimeType: string }): string | null {
  if (input.mimeType === "video/mp4") return validateMediaMetadata(input);
  if (!input.sizeBytes || input.sizeBytes > MAX_ATTACHMENT_BYTES) return "Attachments must be between 1 byte and 10 MB.";
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(input.mimeType)) {
    return "Unsupported file type. Use TXT, Markdown, CSV, JSON, PDF, PNG, JPEG, WebP, GIF, or MP4.";
  }
  if (["image/png", "image/jpeg", "image/webp"].includes(input.mimeType)) return validateMediaMetadata(input);
  return null;
}

export function validateAttachment(file: File): string | null {
  return validateAttachmentMetadata({ name: file.name, sizeBytes: file.size, mimeType: file.type });
}

export async function prepareAgentAttachment(
  ctx: AgentActorContext,
  sessionId: string,
  input: { name: string; mimeType: string; sizeBytes: number }
): Promise<{ attachment: AgentAttachmentRow; path: string; token: string; signedUrl: string }> {
  const validationError = validateAttachmentMetadata(input);
  if (validationError) throw new Error(validationError);
  const id = crypto.randomUUID();
  const actorId = isTenantAgentContext(ctx) ? ctx.actorUserId : ctx.ownerId;
  const path = `${actorId}/${sessionId}/${id}-${safeFileName(input.name)}`;

  const { data, error } = await ctx.supabase
    .from("social_agent_attachments")
    .insert({
      id,
      owner_id: actorId,
      session_id: sessionId,
      storage_path: path,
      original_name: input.name.slice(0, 255),
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      processing_status: "UPLOADED",
      extracted_text: null,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Attachment metadata insert failed");

  const { data: signed, error: signedError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path);
  if (signedError || !signed) {
    await ctx.supabase.from("social_agent_attachments").delete().eq("id", id);
    throw new Error(signedError?.message ?? "Could not prepare private upload");
  }
  return { attachment: data as AgentAttachmentRow, path, token: signed.token, signedUrl: signed.signedUrl };
}

export async function finalizeAgentAttachment(ctx: AgentActorContext, attachmentId: string): Promise<AgentAttachmentRow> {
  let query = ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("id", attachmentId)
    .is("message_id", null);
  if (!isTenantAgentContext(ctx)) {
    query = query.eq("owner_id", ctx.ownerId);
  }
  const { data } = await query.maybeSingle();
  const attachment = data as AgentAttachmentRow | null;
  if (!attachment) throw new Error("Attachment not found");

  const pathParts = attachment.storage_path.split("/");
  const objectName = pathParts.pop();
  const folder = pathParts.join("/");
  const { data: objects, error: listError } = await ctx.supabase.storage
    .from(ATTACHMENT_BUCKET)
    .list(folder, { search: objectName, limit: 2 });
  if (listError || !objectName || !objects?.some((object) => object.name === objectName)) {
    throw new Error(listError?.message ?? "Uploaded attachment object was not found");
  }

  let extractedText: string | null = null;
  let processingStatus: AgentAttachmentRow["processing_status"] = "STORED_UNREADABLE";
  if (TEXT_MIME_TYPES.has(attachment.mime_type)) {
    const { data: blob, error: downloadError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).download(attachment.storage_path);
    if (downloadError || !blob) throw new Error(downloadError?.message ?? "Could not read uploaded attachment");
    extractedText = (await blob.text()).slice(0, MAX_EXTRACTED_CHARACTERS);
    processingStatus = "EXTRACTED";
  }

  const { data: updated, error } = await ctx.supabase
    .from("social_agent_attachments")
    .update({ processing_status: processingStatus, extracted_text: extractedText })
    .eq("id", attachment.id)
    .select("*")
    .single();
  if (error || !updated) throw new Error(error?.message ?? "Could not finalize attachment");
  let finalized = updated as AgentAttachmentRow;
  if (["video/mp4", "image/png", "image/jpeg", "image/webp"].includes(finalized.mime_type)) {
    const { ensureMediaAssetForAttachment } = await import("./media-assets.ts");
    const mediaAsset = await ensureMediaAssetForAttachment(ctx, finalized);
    finalized = { ...finalized, media_asset_id: mediaAsset.id };
  }
  return finalized;
}

export async function listSessionAttachments(ctx: AgentActorContext, sessionId: string): Promise<AgentAttachmentRow[]> {
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AgentAttachmentRow[];
}

export async function getAttachmentsByIds(ctx: AgentActorContext, sessionId: string, ids: string[]): Promise<AgentAttachmentRow[]> {
  if (!ids.length) return [];
  let query = ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("session_id", sessionId)
    .in("id", ids);
  if (!isTenantAgentContext(ctx)) {
    query = query.eq("owner_id", ctx.ownerId);
  }
  const { data } = await query;
  return (data ?? []) as AgentAttachmentRow[];
}

export async function bindAttachmentsToMessage(
  ctx: AgentActorContext,
  sessionId: string,
  ids: string[],
  messageId: string,
  runId: string
) {
  if (!ids.length) return;
  let query = ctx.supabase
    .from("social_agent_attachments")
    .update({ message_id: messageId, run_id: runId })
    .eq("session_id", sessionId)
    .is("message_id", null)
    .in("id", ids);
  if (!isTenantAgentContext(ctx)) {
    query = query.eq("owner_id", ctx.ownerId);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function listAttachmentsForMessages(ctx: AgentActorContext, messageIds: string[]): Promise<AgentAttachmentRow[]> {
  if (!messageIds.length) return [];
  let query = ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });
  if (!isTenantAgentContext(ctx)) {
    query = query.eq("owner_id", ctx.ownerId);
  }
  const { data } = await query;
  return (data ?? []) as AgentAttachmentRow[];
}

export interface ModelImageAttachment {
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string;
}

/**
 * Loads only user-uploaded image bytes for the creative vision boundary.
 * Storage paths, attachment/media IDs, and every database field stay local;
 * Gemini receives private inline bytes rather than a public or signed URL.
 */
export async function loadImageAttachmentsForModel(
  ctx: AgentActorContext,
  messageId: string,
  maxImages = 4,
): Promise<ModelImageAttachment[]> {
  const rows = (await listAttachmentsForMessages(ctx, [messageId]))
    .filter((attachment): attachment is AgentAttachmentRow & { mime_type: ModelImageAttachment["mimeType"] } =>
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(attachment.mime_type)
    )
    .slice(0, maxImages);
  const images = await Promise.all(rows.map(async (attachment): Promise<ModelImageAttachment | null> => {
    const { data: blob, error } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).download(attachment.storage_path);
    if (error || !blob) return null;
    return { mimeType: attachment.mime_type, data: Buffer.from(await blob.arrayBuffer()).toString("base64") };
  }));
  return images.filter((image): image is ModelImageAttachment => image !== null);
}

/** Loads the most recent ordered image set across a session. This is used by
 * WhatsApp's conservative 45-second grouping adapter; web behavior remains
 * identical for ordinary single-message missions. */
export async function loadSessionImageAttachmentsForModel(ctx: AgentActorContext, sessionId: string, maxImages = 8): Promise<ModelImageAttachment[]> {
  const rows = (await listSessionAttachments(ctx, sessionId))
    .filter((attachment): attachment is AgentAttachmentRow & { mime_type: ModelImageAttachment["mimeType"] } =>
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(attachment.mime_type))
    .slice(-maxImages);
  const images = await Promise.all(rows.map(async (attachment): Promise<ModelImageAttachment | null> => {
    const { data: blob, error } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).download(attachment.storage_path);
    if (error || !blob) return null;
    return { mimeType: attachment.mime_type, data: Buffer.from(await blob.arrayBuffer()).toString("base64") };
  }));
  return images.filter((image): image is ModelImageAttachment => image !== null);
}

export async function removeUnsentAttachment(ctx: AgentActorContext, attachmentId: string) {
  let query = ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("id", attachmentId)
    .is("message_id", null);
  if (!isTenantAgentContext(ctx)) {
    query = query.eq("owner_id", ctx.ownerId);
  }
  const { data } = await query.maybeSingle();
  const attachment = data as AgentAttachmentRow | null;
  if (!attachment) throw new Error("Attachment cannot be removed after it is sent.");

  const { error: storageError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
  if (storageError) throw new Error(storageError.message);
  let deleteQuery = ctx.supabase.from("social_agent_attachments").delete().eq("id", attachment.id);
  if (!isTenantAgentContext(ctx)) {
    deleteQuery = deleteQuery.eq("owner_id", ctx.ownerId);
  }
  const { error } = await deleteQuery;
  if (error) throw new Error(error.message);
  if (attachment.media_asset_id) {
    let assetDelete = ctx.supabase
      .from("social_media_assets")
      .delete()
      .eq("id", attachment.media_asset_id);
    if (isTenantAgentContext(ctx)) {
      assetDelete = assetDelete.eq("tenant_id", ctx.tenantId);
    } else {
      assetDelete = assetDelete.eq("owner_id", ctx.ownerId);
    }
    const { error: assetError } = await assetDelete;
    if (assetError) throw new Error(assetError.message);
  }
}

export function attachmentPart(attachments: AgentAttachmentRow[]) {
  return {
    type: "attachments" as const,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.original_name,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      processingStatus: attachment.processing_status,
      mediaAssetId: attachment.media_asset_id,
    })),
  };
}
