import type { ToolCallRequest } from "./provider.ts";

export const INTERNAL_DEPENDENTS_KEY = "__stratxcelDependents";

export interface DeferredAction {
  tool: string;
  input: Record<string, unknown>;
  bind: { inputKey: string };
}

const DEPENDENCIES: Record<string, { inputKey: string; upstreamTools: string[] }> = {
  create_content_variant: { inputKey: "masterId", upstreamTools: ["create_content_item"] },
  schedule_post: { inputKey: "variantId", upstreamTools: ["create_content_variant"] },
};

export function splitDependentCalls(calls: ToolCallRequest[]) {
  const ready: ToolCallRequest[] = [];
  const deferredByUpstream = new Map<string, DeferredAction[]>();

  for (const call of calls) {
    const rule = DEPENDENCIES[call.name];
    const supplied = rule && typeof call.arguments[rule.inputKey] === "string" && String(call.arguments[rule.inputKey]).trim();
    if (!rule || supplied) {
      ready.push(call);
      continue;
    }

    const upstream = [...ready].reverse().find((candidate) => rule.upstreamTools.includes(candidate.name));
    if (!upstream) {
      // Never queue an invalid mutation. The provider receives an honest tool
      // result and can ask for the missing upstream object instead.
      ready.push({ ...call, arguments: { ...call.arguments, __blockedDependency: rule.inputKey } });
      continue;
    }
    const list = deferredByUpstream.get(upstream.id) ?? [];
    list.push({ tool: call.name, input: { ...call.arguments }, bind: { inputKey: rule.inputKey } });
    deferredByUpstream.set(upstream.id, list);
  }

  return { ready, deferredByUpstream };
}

export function stripInternalInput(input: Record<string, unknown>) {
  const { [INTERNAL_DEPENDENTS_KEY]: _dependents, __blockedDependency: _blocked, ...publicInput } = input;
  return publicInput;
}

export function readDeferredActions(input: Record<string, unknown>): DeferredAction[] {
  const value = input[INTERNAL_DEPENDENTS_KEY];
  return Array.isArray(value) ? (value as DeferredAction[]) : [];
}
