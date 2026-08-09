import assert from "node:assert/strict";
import { runAgentTurn } from "../orchestrator.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import { findActiveSession, resetAgentSession } from "../sessions/repository.ts";
import { forgetAgentFact, rememberAgentFact } from "../brain/memory/repository.ts";
import type { AgentLLMProvider, AgentTurnMessage } from "../provider.ts";
import type { StaffAgentPrincipal } from "../principal.ts";
import type { ClientAgentPrincipal } from "../principal.ts";
import type { AgentTool } from "../tools/contract.ts";

const principal: StaffAgentPrincipal = { kind: "staff", channel: "admin_web", authUserId: "staff-a", tenantId: null, role: "platform_admin", permissions: ["agent:read:test"] };

async function run() {
  const { client } = createFakeSupabase({
    agent_sessions: [{ id: "session-a", principal_kind: "staff", auth_user_id: "staff-a", tenant_id: null, channel: "admin_web", status: "active", created_at: "2026-08-09T00:00:00Z", updated_at: "2026-08-09T00:00:00Z" }],
    agent_messages: [
      { id: "m1", session_id: "session-a", role: "user", content: "Show today's leads", tool_name: null, created_at: "2026-08-09T00:00:01Z" },
      { id: "m2", session_id: "session-a", role: "assistant", content: "The first lead is Acme.", tool_name: null, created_at: "2026-08-09T00:00:02Z" },
    ],
  });
  const calls: AgentTurnMessage[][] = [];
  let round = 0;
  const provider: AgentLLMProvider = { isConfigured: () => true, async complete(messages) { calls.push(messages.map((m) => ({ ...m }))); round += 1; return round === 1 ? { text: "", toolCalls: [{ id: "c1", name: "test_one", arguments: {} }, { id: "c2", name: "test_two", arguments: {} }] } : { text: "Acme should be first.", toolCalls: [] }; } };
  const invoked: string[] = [];
  const tools: AgentTool[] = ["test_one", "test_two"].map((name) => ({ schema: { name, description: name, parameters: {} }, mutating: false, risk: "read", requiredPermission: "agent:read:test", async execute() { invoked.push(name); return { name, factual: true }; } }));
  const result = await runAgentTurn({ supabase: client as any, principal, provider, userText: "Which one is most important?", extraTools: tools });
  assert.equal(result.status, "completed");
  assert.equal(result.replyText, "Acme should be first.", "the user reply must contain synthesis without appended raw tool traces");
  assert.ok(!result.replyText.includes("test_one") && !result.replyText.includes("factual"), "tool names and payload fields must remain out of normal UX");
  assert.ok(calls[0].some((m) => m.content.includes("The first lead is Acme")), "previous assistant turn must be supplied to the next model call");
  assert.deepEqual(invoked, ["test_one", "test_two"], "multiple authorized tool calls in one round must execute");
  assert.ok(calls[1].some((m) => m.role === "tool" && m.toolName === "test_one"), "subsequent reasoning round must receive tool output");

  const tenantA: ClientAgentPrincipal = { kind: "client", channel: "client_web", authUserId: "shared-user", tenantId: "tenant-a", role: "owner", permissions: [] };
  const { client: tenantClient, tables } = createFakeSupabase({ agent_sessions: [
    { id: "session-other", principal_kind: "client", auth_user_id: "shared-user", tenant_id: "tenant-b", channel: "client_web", status: "active", created_at: "2026-08-09T00:00:00Z", updated_at: "2026-08-09T00:00:00Z" },
    { id: "session-own", principal_kind: "client", auth_user_id: "shared-user", tenant_id: "tenant-a", channel: "client_web", status: "active", created_at: "2026-08-09T00:00:01Z", updated_at: "2026-08-09T00:00:01Z" },
  ] });
  assert.equal((await findActiveSession(tenantClient as any, tenantA))?.id, "session-own", "active history must be tenant scoped");
  await resetAgentSession(tenantClient as any, tenantA);
  assert.equal(tables.agent_sessions.find((item) => item.id === "session-other")?.status, "active", "reset must not close another tenant's session");
  assert.equal(tables.agent_sessions.find((item) => item.id === "session-own")?.status, "closed", "reset must close the current tenant's session");

  const owner: StaffAgentPrincipal = { ...principal, authUserId: "owner-a", role: "platform_owner" };
  const { client: memoryClient, tables: memoryTables } = createFakeSupabase({ agent_memories: [
    { id: "agency-memory", scope: "agency", owner_auth_user_id: null, tenant_id: null, memory_key: "tone", memory_value: "Agency default", deleted_at: null },
    { id: "personal-memory", scope: "personal", owner_auth_user_id: "owner-a", tenant_id: null, memory_key: "tone", memory_value: "Personal default", deleted_at: null },
  ] });
  await rememberAgentFact(memoryClient as any, owner, { scope: "personal", key: "tone", value: "Keep it concise" });
  assert.equal(memoryTables.agent_memories.find((item) => item.id === "personal-memory")?.memory_value, "Keep it concise", "personal memory update must use null-safe owner and tenant scope");
  assert.equal(memoryTables.agent_memories.find((item) => item.id === "agency-memory")?.memory_value, "Agency default", "personal memory update must not overwrite agency memory");
  await forgetAgentFact(memoryClient as any, owner, { scope: "personal", key: "tone" });
  assert.ok(memoryTables.agent_memories.find((item) => item.id === "personal-memory")?.deleted_at, "forget must soft-delete only the selected scoped memory");
  assert.equal(memoryTables.agent_memories.find((item) => item.id === "agency-memory")?.deleted_at, null, "forget must preserve another scope with the same key");
  console.log("brain-orchestrator.test.ts (@stratxcel/agent-core): ALL PASS");
}
run();
