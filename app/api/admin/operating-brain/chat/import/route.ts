import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/lib/owner-brain/db-context";
import { getChatProvider } from "@/lib/owner-brain/chat/providers";
import { importHash, MAX_CHAT_IMPORT_BYTES, parseChatGptExport, parseClaudeExport, readZipJson } from "@/lib/owner-brain/chat/imports";

const ALLOWED_MIME = new Set(["application/json", "application/zip", "application/x-zip-compressed"]);

export async function POST(request: Request) {
  const ctx = await requireOwnerContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const form = await request.formData().catch(() => null);
  const providerKey = String(form?.get("provider") ?? "");
  const provider = getChatProvider(providerKey);
  const file = form?.get("export");
  if (!provider?.supportsImport || !(file instanceof File)) return NextResponse.json({ error: "A supported provider and export file are required" }, { status: 400 });
  if (file.size > MAX_CHAT_IMPORT_BYTES) return NextResponse.json({ error: "Export exceeds the 50MB limit" }, { status: 413 });
  if (!ALLOWED_MIME.has(file.type) && !/\.(json|zip)$/i.test(file.name)) return NextResponse.json({ error: "Only official JSON or ZIP exports are accepted" }, { status: 415 });

  const bytes = Buffer.from(await file.arrayBuffer());
  let jsonBytes = bytes;
  if (/\.zip$/i.test(file.name) || file.type.includes("zip")) {
    const expected = providerKey === "chatgpt" ? /(^|\/)conversations\.json$/i : /(^|\/)(conversations|claude).*\.json$/i;
    try { jsonBytes = readZipJson(bytes, expected); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Malformed ZIP export" }, { status: 400 }); }
  }

  let parsed: unknown;
  try { parsed = JSON.parse(jsonBytes.toString("utf8")); } catch { return NextResponse.json({ error: "Malformed export JSON" }, { status: 400 }); }
  let messages;
  try { messages = providerKey === "chatgpt" ? parseChatGptExport(parsed) : parseClaudeExport(parsed); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Malformed export" }, { status: 400 }); }

  const { data: connection, error: connectionError } = await ctx.supabase.from("owner_chat_connections").select("id").eq("owner_id", ctx.ownerId).eq("provider_key", providerKey).single();
  if (connectionError) return NextResponse.json({ error: "Provider is not initialized" }, { status: 409 });
  const hash = importHash(bytes);
  const { data: existing } = await ctx.supabase.from("owner_chat_imports").select("id, message_count").eq("connection_id", connection.id).eq("import_hash", hash).maybeSingle();
  if (existing) return NextResponse.json({ imported: 0, duplicate: true, previousCount: existing.message_count });
  const conversationCount = new Set(messages.map((message) => message.conversationExternalId)).size;
  const { data: importRow, error: importError } = await ctx.supabase.from("owner_chat_imports").insert({ owner_id: ctx.ownerId, connection_id: connection.id, import_hash: hash, source_filename: file.name.slice(0, 255), status: "PROCESSING" }).select("id").single();
  if (importError) return NextResponse.json({ error: "Could not start import" }, { status: 500 });
  const rows = messages.map((message) => ({ owner_id: ctx.ownerId, connection_id: connection.id, import_id: importRow.id, external_id: message.externalId, conversation_external_id: message.conversationExternalId, role: message.role, content: message.content, occurred_at: message.occurredAt, provenance: { provider: providerKey, connection: connection.id, conversation: message.conversationExternalId, external_id: message.externalId, import_id: importRow.id } }));
  for (let offset = 0; offset < rows.length; offset += 500) await ctx.supabase.from("owner_chat_messages").upsert(rows.slice(offset, offset + 500), { onConflict: "connection_id,external_id", ignoreDuplicates: true });
  const now = new Date().toISOString();
  await ctx.supabase.from("owner_chat_imports").update({ status: "SUCCEEDED", conversation_count: conversationCount, message_count: messages.length, completed_at: now }).eq("id", importRow.id).eq("owner_id", ctx.ownerId);
  await ctx.supabase.from("owner_chat_connections").update({ status: "CONNECTED", last_sync_at: now, last_success_at: now, last_error: null, health: { mode: "import", conversation_count: conversationCount, message_count: messages.length } }).eq("id", connection.id).eq("owner_id", ctx.ownerId);
  return NextResponse.json({ imported: messages.length, conversations: conversationCount, duplicate: false });
}

export const dynamic = "force-dynamic";
