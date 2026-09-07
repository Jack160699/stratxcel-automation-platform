// Run with: node --experimental-strip-types packages/hermes/src/__tests__/native-adapter.test.ts
import assert from "node:assert/strict";
import type { MissionRow } from "@stratxcel/missions";
import { createNativeHermesAdapter, type NativeLLMMessage, type NativeLLMProvider, type NativeToolCallRequest, type NativeToolInvoker } from "../native-adapter.ts";
import type { MissionScopedContext, ToolName } from "../types.ts";

function fakeMission(): MissionRow {
  return {
    id: "mission-1",
    tenant_id: "tenant-1",
    created_by: null,
    goal_text: "Research whether solar is a good business in Bhilai.",
    service_key: "custom_mission",
    state: "RUNNING",
    estimated_cost_cents: 1000,
    hermes_profile: "stratxcel-research",
    hermes_run_id: null,
    brand_brain_version: 1,
    version: 1,
    idempotency_key: null,
    actual_cost_cents: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fakeContext(allowedTools: ToolName[]): MissionScopedContext {
  return {
    missionId: "mission-1",
    tenantId: "tenant-1",
    goalText: "Research whether solar is a good business in Bhilai.",
    serviceKey: "custom_mission",
    hermesProfile: "stratxcel-research",
    brandBrainVersion: 1,
    brandBrain: { business_name: "Test Co" },
    budgetCents: 1000,
    allowedTools,
  };
}

/** A scripted provider: returns each entry in `script` in order, one per complete() call. */
function scriptedProvider(script: Array<{ text: string; toolCalls: NativeToolCallRequest[] }>, configured = true): {
  provider: NativeLLMProvider;
  callsSeen: NativeLLMMessage[][];
} {
  let i = 0;
  const callsSeen: NativeLLMMessage[][] = [];
  return {
    callsSeen,
    provider: {
      isConfigured: () => configured,
      async complete(messages) {
        callsSeen.push(messages.map((m) => ({ ...m })));
        const next = script[Math.min(i, script.length - 1)];
        i += 1;
        return next;
      },
    },
  };
}

async function run() {
  // 1. Unconfigured provider -> BLOCKED, no tool calls attempted.
  {
    const { provider } = scriptedProvider([{ text: "unused", toolCalls: [] }], false);
    let invoked = false;
    const invokeTool: NativeToolInvoker = async () => {
      invoked = true;
      return {};
    };
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(result.outcome, "BLOCKED");
    assert.equal(invoked, false);
  }

  // 2. No tool calls at all -> COMPLETED with the model's final text as summary.
  {
    const { provider } = scriptedProvider([{ text: "Solar looks promising in Bhilai.", toolCalls: [] }]);
    const adapter = createNativeHermesAdapter({
      createProvider: () => provider,
      invokeTool: async () => ({ ok: true }),
    });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(result.outcome, "COMPLETED");
    assert.equal(result.summary, "Solar looks promising in Bhilai.");
    assert.ok(result.progressEvents && result.progressEvents.length >= 1);
  }

  // 3. One real tool call, then a final answer -> COMPLETED, tool actually invoked
  //    with the verified mission/tenant context, and its result reaches the
  //    next round's messages.
  {
    const invokedWith: unknown[] = [];
    const invokeTool: NativeToolInvoker = async (tool, ctx, input) => {
      invokedWith.push({ tool, ctx, input });
      return { brandBrain: { business_name: "Test Co" } };
    };
    const { provider, callsSeen } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "get_brand_context", arguments: {} }] },
      { text: "Done — used the brand context.", toolCalls: [] },
    ]);
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(result.outcome, "COMPLETED");
    assert.equal(result.summary, "Done — used the brand context.");
    assert.equal(invokedWith.length, 1);
    assert.deepEqual(invokedWith[0], {
      tool: "get_brand_context",
      ctx: { missionId: "mission-1", tenantId: "tenant-1", correlationId: (invokedWith[0] as { ctx: { correlationId: string } }).ctx.correlationId, allowedTools: ["get_brand_context"] },
      input: {},
    });
    // Second round's messages must include the tool's real result.
    const secondRoundMessages = callsSeen[1];
    const toolMessage = secondRoundMessages.find((m) => m.role === "tool");
    assert.ok(toolMessage && toolMessage.content.includes("Test Co"));
  }

  // 4. A tool call outside allowedTools is rejected in-process -- never invoked.
  {
    let invoked = false;
    const invokeTool: NativeToolInvoker = async () => {
      invoked = true;
      return {};
    };
    const { provider, callsSeen } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "create_crm_lead", arguments: {} }] },
      { text: "Understood, cannot do that.", toolCalls: [] },
    ]);
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(invoked, false);
    assert.equal(result.outcome, "COMPLETED");
    const toolMessage = callsSeen[1].find((m) => m.role === "tool");
    assert.ok(toolMessage && toolMessage.content.includes("not in this mission's allowedTools"));
  }

  // 5. request_approval -> AWAITING_APPROVAL, loop stops immediately.
  {
    const { provider } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "request_approval", arguments: { kind: "spend", subject: {} } }] },
      { text: "should never be reached", toolCalls: [] },
    ]);
    const adapter = createNativeHermesAdapter({
      createProvider: () => provider,
      invokeTool: async () => ({ approvalId: "appr-1", status: "PENDING" }),
    });
    const result = await adapter.execute(fakeMission(), fakeContext(["request_approval"]), "tok");
    assert.equal(result.outcome, "AWAITING_APPROVAL");
  }

  // 6. create_human_handoff -> HUMAN_HANDOFF.
  {
    const { provider } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "create_human_handoff", arguments: { reason: "blocked", contextSnapshot: {} } }] },
    ]);
    const adapter = createNativeHermesAdapter({
      createProvider: () => provider,
      invokeTool: async () => ({ handoffId: "h-1" }),
    });
    const result = await adapter.execute(fakeMission(), fakeContext(["create_human_handoff"]), "tok");
    assert.equal(result.outcome, "HUMAN_HANDOFF");
  }

  // 7. A tool call that throws is caught, reported back as a tool error, and
  //    does not fail the whole mission run.
  {
    const invokeTool: NativeToolInvoker = async () => {
      throw new Error("boom");
    };
    const { provider, callsSeen } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "get_brand_context", arguments: {} }] },
      { text: "Recovered.", toolCalls: [] },
    ]);
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(result.outcome, "COMPLETED");
    const toolMessage = callsSeen[1].find((m) => m.role === "tool");
    assert.ok(toolMessage && toolMessage.content.includes("boom"));
  }

  // 8. The provider itself throwing (a real network/API failure) -> FAILED,
  //    never silently treated as success.
  {
    const provider: NativeLLMProvider = {
      isConfigured: () => true,
      complete: async () => {
        throw new Error("provider unreachable");
      },
    };
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool: async () => ({}) });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(result.outcome, "FAILED");
    assert.ok(result.summary.includes("provider unreachable"));
  }

  // 9. A model that never stops calling tools is bounded by maxRounds ->
  //    PARTIALLY_COMPLETED, never an infinite loop.
  {
    let calls = 0;
    const provider: NativeLLMProvider = {
      isConfigured: () => true,
      async complete() {
        calls += 1;
        return { text: "", toolCalls: [{ id: `call-${calls}`, name: "get_brand_context", arguments: {} }] };
      },
    };
    const adapter = createNativeHermesAdapter({
      createProvider: () => provider,
      invokeTool: async () => ({ brandBrain: null }),
      maxRounds: 3,
    });
    const result = await adapter.execute(fakeMission(), fakeContext(["get_brand_context"]), "tok");
    assert.equal(result.outcome, "PARTIALLY_COMPLETED");
    assert.equal(calls, 3);
  }

  // 11. A costed tool call (generate_image) within budget is invoked
  //     normally, and its estimated cost is tracked against the mission.
  {
    const invokedWith: unknown[] = [];
    const invokeTool: NativeToolInvoker = async (tool, ctx, input) => {
      invokedWith.push({ tool, input });
      return { outcome: "OK", candidates: [{ id: "cand-1" }] };
    };
    const { provider } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "generate_image", arguments: { brief: "a solar panel on a roof" } }] },
      { text: "Made one image.", toolCalls: [] },
    ]);
    const smallBudgetContext = { ...fakeContext(["generate_image"]), budgetCents: 30 };
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), smallBudgetContext, "tok");
    assert.equal(result.outcome, "COMPLETED");
    assert.equal(invokedWith.length, 1, "the costed call within budget must actually be invoked");
    console.log("native-adapter.test.ts: a costed tool call within budget is invoked normally — PASS");
  }

  // 12. A second costed call that would exceed the mission's remaining
  //     budget is REFUSED before ever reaching invokeTool -- proving the
  //     pre-call budget gate is real, not just documented.
  {
    let invokedCount = 0;
    const invokeTool: NativeToolInvoker = async () => {
      invokedCount += 1;
      return { outcome: "OK", candidates: [{ id: "cand-1" }] };
    };
    const { provider, callsSeen } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "generate_image", arguments: { brief: "image one" } }] },
      { text: "", toolCalls: [{ id: "call-2", name: "generate_image", arguments: { brief: "image two" } }] },
      { text: "Stopped -- out of budget.", toolCalls: [] },
    ]);
    // budgetCents: 30 -- one 25-cent call fits, a second 25-cent call (50 total) does not.
    const smallBudgetContext = { ...fakeContext(["generate_image"]), budgetCents: 30 };
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), smallBudgetContext, "tok");
    assert.equal(result.outcome, "COMPLETED");
    assert.equal(invokedCount, 1, "only the first, affordable call may actually reach invokeTool -- the second must be refused pre-call");
    const thirdRoundMessages = callsSeen[2];
    const refusalMessage = thirdRoundMessages.find((m) => m.role === "tool" && m.toolCallId === "call-2");
    assert.ok(refusalMessage?.content.includes("budget"), "the model must be told the real reason the second call was refused");
    console.log("native-adapter.test.ts: a costed call that would exceed the mission's remaining budget is refused before invokeTool, never silently allowed — PASS");
  }

  // 13. Free tools (no entry in the cost-estimate table) are never subject
  //     to the budget check at all -- existing behavior is unchanged.
  {
    let invoked = false;
    const invokeTool: NativeToolInvoker = async () => {
      invoked = true;
      return { brandBrain: null };
    };
    const { provider } = scriptedProvider([
      { text: "", toolCalls: [{ id: "call-1", name: "get_brand_context", arguments: {} }] },
      { text: "Done.", toolCalls: [] },
    ]);
    // budgetCents: 0 -- if get_brand_context were mistakenly treated as
    // costed, this would refuse it. It must not be.
    const zeroBudgetContext = { ...fakeContext(["get_brand_context"]), budgetCents: 0 };
    const adapter = createNativeHermesAdapter({ createProvider: () => provider, invokeTool });
    const result = await adapter.execute(fakeMission(), zeroBudgetContext, "tok");
    assert.equal(result.outcome, "COMPLETED");
    assert.equal(invoked, true, "a free tool must never be blocked by the budget gate, even at zero budget");
    console.log("native-adapter.test.ts: free tools are never subject to the budget gate — PASS");
  }

  // 10. mode/healthCheck report "native" correctly.
  {
    const adapter = createNativeHermesAdapter({ createProvider: () => scriptedProvider([]).provider, invokeTool: async () => ({}) });
    assert.equal(adapter.mode, "native");
    const health = await adapter.healthCheck();
    assert.equal(health.healthy, true);
    assert.equal(health.mode, "native");
    await adapter.cancel("does-not-exist"); // must not throw
  }

  console.log("native-adapter.test.ts (@stratxcel/hermes): ALL PASS");
}

run();
