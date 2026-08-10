import assert from "node:assert/strict";
import { importHash, MAX_CHAT_IMPORT_BYTES, parseChatGptExport, parseClaudeExport, safeArchivePath } from "../chat/imports.ts";

const chatgpt = [{ id: "conversation-1", mapping: { node: { message: { id: "message-1", author: { role: "user" }, content: { parts: ["hello"] }, create_time: 1 } } } }];
const parsedChatGpt = parseChatGptExport(chatgpt);
assert.equal(parsedChatGpt.length, 1);
assert.equal(parsedChatGpt[0].content, "hello");
assert.equal(parsedChatGpt[0].conversationExternalId, "conversation-1");

const claude = [{ uuid: "conversation-2", chat_messages: [{ uuid: "message-2", sender: "human", text: "hi", created_at: "2026-01-01T00:00:00Z" }] }];
const parsedClaude = parseClaudeExport(claude);
assert.equal(parsedClaude.length, 1);
assert.equal(parsedClaude[0].externalId, "message-2");

assert.throws(() => parseChatGptExport({}), /conversations array/);
assert.throws(() => parseClaudeExport({}), /conversations/);
assert.equal(importHash(Buffer.from("same")), importHash(Buffer.from("same")), "duplicate imports must hash identically");
assert.notEqual(importHash(Buffer.from("same")), importHash(Buffer.from("different")));
assert.equal(safeArchivePath("conversations.json"), true);
assert.equal(safeArchivePath("export/conversations.json"), true);
assert.equal(safeArchivePath("../secrets.env"), false);
assert.equal(safeArchivePath("folder\\..\\secrets.env"), false);
assert.equal(safeArchivePath("C:/secrets.env"), false);
assert.equal(MAX_CHAT_IMPORT_BYTES, 50 * 1024 * 1024);
console.log("chat-imports.test.ts: ALL PASS");
