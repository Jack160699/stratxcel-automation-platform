import crypto from "node:crypto";
import zlib from "node:zlib";

export const MAX_CHAT_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_CHAT_MESSAGES = 100_000;
export const MAX_MESSAGE_CHARS = 100_000;

export interface NormalizedChatMessage {
  externalId: string; conversationExternalId: string; role: string; content: string; occurredAt: string;
}

export function importHash(bytes: Buffer): string { return crypto.createHash("sha256").update(bytes).digest("hex"); }
export function safeArchivePath(name: string): boolean {
  const normalized = name.replaceAll("\\", "/");
  return !normalized.startsWith("/") && !/^[a-zA-Z]:\//.test(normalized) && !normalized.split("/").includes("..");
}

/** Reads one allowlisted JSON entry without extracting an archive to disk. */
export function readZipJson(bytes: Buffer, expected: RegExp): Buffer {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > bytes.length) throw new Error("Malformed ZIP export");
  const entries = bytes.readUInt16LE(eocd + 10);
  let cursor = bytes.readUInt32LE(eocd + 16);
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Malformed ZIP directory");
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const expandedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!safeArchivePath(name)) throw new Error("Unsafe archive path rejected");
    if (expected.test(name)) {
      if (expandedSize > MAX_CHAT_IMPORT_BYTES || compressedSize > MAX_CHAT_IMPORT_BYTES) throw new Error("Expanded export exceeds the 50MB limit");
      if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Malformed ZIP entry");
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(start, start + compressedSize);
      const output = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed, { maxOutputLength: MAX_CHAT_IMPORT_BYTES }) : null;
      if (!output) throw new Error("Unsupported ZIP compression method");
      return Buffer.from(output);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("No supported conversations JSON found in export");
}

function textFromParts(parts: unknown): string {
  if (typeof parts === "string") return parts;
  if (!Array.isArray(parts)) return "";
  return parts.filter((part): part is string => typeof part === "string").join("\n");
}

export function parseChatGptExport(value: unknown): NormalizedChatMessage[] {
  if (!Array.isArray(value)) throw new Error("ChatGPT export must contain a conversations array");
  const out: NormalizedChatMessage[] = [];
  for (const conversation of value as Array<Record<string, unknown>>) {
    const conversationId = String(conversation.id ?? conversation.conversation_id ?? "");
    const mapping = conversation.mapping;
    if (!conversationId || !mapping || typeof mapping !== "object") continue;
    for (const [nodeId, rawNode] of Object.entries(mapping as Record<string, unknown>)) {
      const node = rawNode as { message?: { id?: string; author?: { role?: string }; content?: { parts?: unknown }; create_time?: number } };
      const message = node.message;
      const content = textFromParts(message?.content?.parts).slice(0, MAX_MESSAGE_CHARS);
      if (!message || !content) continue;
      out.push({ externalId: String(message.id ?? nodeId), conversationExternalId: conversationId, role: String(message.author?.role ?? "unknown"), content, occurredAt: new Date((message.create_time ?? 0) * 1000 || Date.now()).toISOString() });
      if (out.length > MAX_CHAT_MESSAGES) throw new Error("Export contains too many messages");
    }
  }
  return out;
}

export function parseClaudeExport(value: unknown): NormalizedChatMessage[] {
  const conversations = Array.isArray(value) ? value : (value as { conversations?: unknown[] } | null)?.conversations;
  if (!Array.isArray(conversations)) throw new Error("Claude export must contain conversations");
  const out: NormalizedChatMessage[] = [];
  for (const conversation of conversations as Array<Record<string, unknown>>) {
    const conversationId = String(conversation.uuid ?? conversation.id ?? "");
    const messages = conversation.chat_messages ?? conversation.messages;
    if (!conversationId || !Array.isArray(messages)) continue;
    for (const raw of messages as Array<Record<string, unknown>>) {
      const content = String(raw.text ?? raw.content ?? "").slice(0, MAX_MESSAGE_CHARS);
      if (!content) continue;
      const created = String(raw.created_at ?? raw.timestamp ?? new Date().toISOString());
      out.push({ externalId: String(raw.uuid ?? raw.id ?? `${conversationId}:${out.length}`), conversationExternalId: conversationId, role: String(raw.sender ?? raw.role ?? "unknown"), content, occurredAt: new Date(created).toISOString() });
      if (out.length > MAX_CHAT_MESSAGES) throw new Error("Export contains too many messages");
    }
  }
  return out;
}
