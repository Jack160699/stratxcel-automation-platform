// Run with: node --experimental-strip-types lib/social/__tests__/whatsapp-bridge.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.SOCIAL_WHATSAPP_LINK_SECRET = "test-only-social-whatsapp-secret-that-is-at-least-32-chars";
const { signWhatsAppSocialHandoff, verifyWhatsAppSocialHandoff } = await import("../whatsapp-handoff-token.ts");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

const claims = { sub: "11111111-1111-4111-8111-111111111111", tenant: "22222222-2222-4222-8222-222222222222", session: "33333333-3333-4333-8333-333333333333", op: "approve" as const };
const token = signWhatsAppSocialHandoff(claims);
assert.equal(verifyWhatsAppSocialHandoff(token)?.session, claims.session);
assert.equal(verifyWhatsAppSocialHandoff(token, { sub: "wrong-user" }), null, "wrong user must fail");
assert.equal(verifyWhatsAppSocialHandoff(token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")), null, "tampering must fail");
assert.equal(verifyWhatsAppSocialHandoff(signWhatsAppSocialHandoff(claims, -1)), null, "expired token must fail");
assert.ok(`sx-social:approve:${token}`.length <= 256, "reply button ID must fit Meta's 256-character limit");

const bridge = read("lib", "social", "whatsapp-bridge.ts");
const route = read("app", "api", "internal", "agent", "whatsapp", "route.ts");
const workerRouter = read("apps", "whatsapp-worker", "src", "agent-channel-router.ts");
const webhook = read("packages", "whatsapp", "src", "webhook.ts");
const adapter = read("packages", "whatsapp", "src", "adapter.ts");
const migration = read("supabase", "migrations", "20260810170000_social_whatsapp_bridge.sql");
const handoff = read("app", "api", "social", "copilot", "whatsapp-handoff", "route.ts");

for (const required of [
  "downloadWhatsAppMedia", "graph.facebook.com", "Authorization", "persistAttachment", "acceptAgentMission", "runAgentTurn",
  "last_media_at", "45_000", "transcribeVoiceNote", "social_whatsapp_inbound_messages", "provider_message_id",
  "summarizeWhatsAppMission", "decideWhatsAppSocialMission",
]) assert.ok(bridge.includes(required), `bridge must include ${required}`);
assert.equal(bridge.includes("admitMemoryCandidate"), false, "WhatsApp voice must not touch Owner Brain memory");
assert.equal(bridge.includes("createOpenLoop"), false, "WhatsApp voice must not create Owner Brain open loops");
assert.ok(workerRouter.includes("mediaId: input.message.mediaId") && workerRouter.includes("mimeType: input.message.mimeType"));
assert.equal(route.includes("unsupported_agent_media"), false, "linked media must no longer stop at text-only rejection");
assert.ok(route.includes("interactiveButtons") && adapter.includes('type: "interactive"'), "real reply buttons must be sent through the existing adapter");
assert.ok(webhook.includes("button_reply") && webhook.includes("list_reply"), "interactive replies must round-trip through webhook parsing");
assert.ok(migration.includes("claim_social_agent_action") && migration.includes("a.status = 'PROPOSED'"), "approval claim must be atomic/idempotent");
assert.ok(handoff.includes("user.id !== claims.sub") && handoff.includes("mapping.tenant_id !== claims.tenant"), "handoff must bind user and tenant");
for (const forbidden of ["provider_account_id", "access_token", "storage_path", "media_asset_id"]) {
  assert.equal(route.includes(forbidden), false, `WhatsApp response route must not expose ${forbidden}`);
}

console.log("whatsapp-bridge.test.ts: ALL PASS (media, grouping, voice isolation, shared mission, signed links, tenant binding, interactive controls, idempotency)");
