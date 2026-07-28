import crypto from "node:crypto";
import type { OwnerContext } from "../db-context";

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
  created_at: string;
}

function safeFileName(name: string) {
  const normalized = name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "-").replace(/\s+/g, "-");
  return normalized.slice(0, 120) || "attachment";
}

export function validateAttachmentMetadata(input: { sizeBytes: number; mimeType: string }): string | null {
  if (!input.sizeBytes || input.sizeBytes > MAX_ATTACHMENT_BYTES) return "Attachments must be between 1 byte and 10 MB.";
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(input.mimeType)) {
    return "Unsupported file type. Use TXT, Markdown, CSV, JSON, PDF, PNG, JPEG, WebP, or GIF.";
  }
  return null;
}

export function validateAttachment(file: File): string | null {
  return validateAttachmentMetadata({ sizeBytes: file.size, mimeType: file.type });
}

export async function prepareAgentAttachment(
  ctx: OwnerContext,
  sessionId: string,
  input: { name: string; mimeType: string; sizeBytes: number }
): Promise<{ attachment: AgentAttachmentRow; path: string; token: string }> {
  const validationError = validateAttachmentMetadata(input);
  if (validationError) throw new Error(validationError);
  const id = crypto.randomUUID();
  const path = `${ctx.ownerId}/${sessionId}/${id}-${safeFileName(input.name)}`;

  const { data, error } = await ctx.supabase
    .from("social_agent_attachments")
    .insert({
      id,
      owner_id: ctx.ownerId,
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
  return { attachment: data as AgentAttachmentRow, path, token: signed.token };
}

export async function finalizeAgentAttachment(ctx: OwnerContext, attachmentId: string): Promise<AgentAttachmentRow> {
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("owner_id", ctx.ownerId)
    .is("message_id", null)
    .maybeSingle();
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
  return updated as AgentAttachmentRow;
}

export async function listSessionAttachments(ctx: OwnerContext, sessionId: string): Promise<AgentAttachmentRow[]> {
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AgentAttachmentRow[];
}

export async function getAttachmentsByIds(ctx: OwnerContext, sessionId: string, ids: string[]): Promise<AgentAttachmentRow[]> {
  if (!ids.length) return [];
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("session_id", sessionId)
    .eq("owner_id", ctx.ownerId)
    .in("id", ids);
  return (data ?? []) as AgentAttachmentRow[];
}

export async function bindAttachmentsToMessage(
  ctx: OwnerContext,
  sessionId: string,
  ids: string[],
  messageId: string,
  runId: string
) {
  if (!ids.length) return;
  const { error } = await ctx.supabase
    .from("social_agent_attachments")
    .update({ message_id: messageId, run_id: runId })
    .eq("session_id", sessionId)
    .eq("owner_id", ctx.ownerId)
    .is("message_id", null)
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function listAttachmentsForMessages(ctx: OwnerContext, messageIds: string[]): Promise<AgentAttachmentRow[]> {
  if (!messageIds.length) return [];
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("owner_id", ctx.ownerId)
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });
  return (data ?? []) as AgentAttachmentRow[];
}

export async function removeUnsentAttachment(ctx: OwnerContext, attachmentId: string) {
  const { data } = await ctx.supabase
    .from("social_agent_attachments")
    .select("*")
    .eq("id", attachmentId)
    .eq("owner_id", ctx.ownerId)
    .is("message_id", null)
    .maybeSingle();
  const attachment = data as AgentAttachmentRow | null;
  if (!attachment) throw new Error("Attachment cannot be removed after it is sent.");

  const { error: storageError } = await ctx.supabase.storage.from(ATTACHMENT_BUCKET).remove([attachment.storage_path]);
  if (storageError) throw new Error(storageError.message);
  const { error } = await ctx.supabase.from("social_agent_attachments").delete().eq("id", attachment.id);
  if (error) throw new Error(error.message);
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
    })),
  };
}
