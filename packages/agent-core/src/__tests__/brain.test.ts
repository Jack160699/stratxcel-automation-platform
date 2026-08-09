import assert from "node:assert/strict";
import { boundConversationHistory, HISTORY_MAX_CHARS, HISTORY_MAX_MESSAGES } from "../brain/conversation-context.ts";
import { capabilityGroupsFromTools } from "../brain/capabilities.ts";
import { assertSafeMemoryValue } from "../brain/memory/repository.ts";
import { resolveEffectiveStaffPermissions } from "../principals/repository.ts";
import type { AgentMessageRow } from "../sessions/repository.ts";
import type { AgentTool } from "../tools/contract.ts";

function row(id: number, content: string): AgentMessageRow { return { id: String(id), session_id: "session-a", role: id % 2 ? "user" : "assistant", content, tool_name: null, created_at: new Date(id).toISOString() }; }

function run() {
  const history = Array.from({ length: 30 }, (_, i) => row(i, `turn-${i}-${"x".repeat(800)}`));
  const bounded = boundConversationHistory(history);
  assert.ok(bounded.length <= HISTORY_MAX_MESSAGES);
  assert.ok(bounded.reduce((sum, item) => sum + item.content.length, 0) <= HISTORY_MAX_CHARS);
  assert.ok(bounded.at(-1)?.content.includes("turn-29"), "newest history must survive trimming");
  assert.ok(!bounded.some((item) => item.content.includes("turn-0-")), "oldest history must be trimmed first");

  const adminCeiling = resolveEffectiveStaffPermissions("platform_admin", { access_profile: "custom", permission_grants: ["agent:read:finance", "agent:read:leads"], permission_denials: [] });
  assert.deepEqual(adminCeiling, ["agent:read:leads"], "custom profile cannot exceed role ceiling");
  assert.ok(!resolveEffectiveStaffPermissions("platform_owner", { access_profile: "sales_crm", permission_denials: ["agent:read:leads"] }).includes("agent:read:leads"), "explicit denial must remove permission");
  assert.deepEqual(resolveEffectiveStaffPermissions("platform_admin", null), resolveEffectiveStaffPermissions("platform_admin"), "missing access row means role_default");

  const tools: AgentTool[] = [{ schema: { name: "list_leads", description: "List leads", parameters: {} }, mutating: false, risk: "read", requiredPermission: "agent:read:leads", async execute() {} }];
  assert.equal(capabilityGroupsFromTools(tools)[0].name, "Leads & conversations");
  assert.throws(() => assertSafeMemoryValue("api_key=secret-value"), /cannot be stored/);
  assert.doesNotThrow(() => assertSafeMemoryValue("Prefer concise operational summaries"));
  console.log("brain.test.ts (@stratxcel/agent-core): ALL PASS");
}
run();
