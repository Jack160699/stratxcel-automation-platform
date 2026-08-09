import assert from "node:assert/strict";
import { runAgentTurn } from "../orchestrator.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import type { AgentLLMProvider, AgentTurnMessage } from "../provider.ts";
import type { StaffAgentPrincipal } from "../principal.ts";
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
  assert.ok(calls[0].some((m) => m.content.includes("The first lead is Acme")), "previous assistant turn must be supplied to the next model call");
  assert.deepEqual(invoked, ["test_one", "test_two"], "multiple authorized tool calls in one round must execute");
  assert.ok(calls[1].some((m) => m.role === "tool" && m.toolName === "test_one"), "subsequent reasoning round must receive tool output");
  console.log("brain-orchestrator.test.ts (@stratxcel/agent-core): ALL PASS");
}
run();
