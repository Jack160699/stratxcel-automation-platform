// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/handle-confirm.test.ts
import assert from "node:assert/strict";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import { createActionConfirmation } from "../confirmations/repository.ts";
import { handleConfirm } from "../control-handlers.ts";
import type { StaffAgentPrincipal } from "../principal.ts";
import type { AgentTool } from "../tools/contract.ts";

const principal: StaffAgentPrincipal = { kind: "staff", channel: "whatsapp", authUserId: "staff-confirm-1", tenantId: null, role: "platform_owner", permissions: ["agent:mutate:test"] };

async function run() {
  // VERIFICATION INTEGRITY regression (Master Brain brief, sections 1/14) --
  // a SECOND, separate instance of the exact defect Update 10 fixed in
  // runAgentTurn's LLM loop, found live in production: handleConfirm's
  // CONFIRM <code> path is fully deterministic (no LLM involved at all) and
  // unconditionally replied "Done. The requested change was completed."
  // after any non-throwing tool.execute() call -- including
  // execute_growth_action's real, correct, non-throwing BLOCKED result
  // (the real action was AWAITING_APPROVAL; nothing was actually changed
  // on the live website). The real Boss was told a real website change had
  // completed when it had not.
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: principal.authUserId,
      channel: "whatsapp",
      actionName: "execute_growth_action",
      normalizedInput: { actionId: "action-1" },
    });
    const blockedTool: AgentTool = {
      schema: { name: "execute_growth_action", description: "test", parameters: {} },
      mutating: true,
      risk: "low_mutation",
      requiredPermission: "agent:mutate:test",
      async execute() {
        // Exactly what the real engine returns for an unapproved action --
        // does not throw, this is a real, valid, non-exceptional result.
        return { status: "BLOCKED", actionId: "action-1", targetUrl: "https://example.com", blockerCode: "NOT_APPROVED", errorMessage: "action is awaiting approval" };
      },
      interpretOutcome(result) {
        const r = result as { status?: string; errorMessage?: string };
        if (r.status === "VERIFIED" || r.status === "COMPLETED") return null;
        return { status: "failed", detail: r.errorMessage };
      },
    };
    const { reply, executed } = await handleConfirm(supabase, principal, confirmation.code, [blockedTool]);
    assert.equal(executed, true, "the tool DID execute -- 'executed' tracks whether execute() ran, not whether the business outcome succeeded");
    assert.ok(!/^Done\.?/.test(reply), "a BLOCKED tool outcome must never be reported as a bare 'Done'");
    assert.ok(/did not succeed/.test(reply), "the real failure/blocked status must appear as failure language");
    assert.ok(reply.includes("action is awaiting approval"), "the real reason must reach the user, not be silently dropped");
  }

  // A tool that succeeds (or has no interpretOutcome at all) must be
  // completely unaffected -- this fix is strictly additive.
  {
    const { client } = createFakeSupabase();
    const supabase = client as any;
    const confirmation = await createActionConfirmation(supabase, {
      authUserId: principal.authUserId,
      channel: "whatsapp",
      actionName: "update_lead_status",
      normalizedInput: { leadId: "lead-1", status: "CONTACTED" },
    });
    const quietTool: AgentTool = {
      schema: { name: "update_lead_status", description: "test", parameters: {} },
      mutating: true,
      risk: "low_mutation",
      requiredPermission: "agent:mutate:test",
      async execute() { return { lead: { id: "lead-1", status: "CONTACTED" } }; },
    };
    const { reply, executed } = await handleConfirm(supabase, principal, confirmation.code, [quietTool]);
    assert.equal(executed, true);
    assert.equal(reply, "Done. The requested change was completed.", "a tool without interpretOutcome (the unchanged default) must keep the exact original reply");
  }

  console.log("handle-confirm.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
