import type { AgentTool } from "../../tools/contract.ts";
import { forgetAgentFact, listAgentMemories, rememberAgentFact } from "./repository.ts";

const scopeSchema = { type: "string", enum: ["personal", "workspace", "agency"] };

export const MEMORY_TOOLS: AgentTool[] = [
  {
    schema: { name: "recall_memory", description: "Recall explicit preferences or facts saved in authorized personal/workspace memory.", parameters: { type: "object", properties: {} } },
    mutating: false, risk: "read", requiredPermission: "agent:read:memory",
    async execute(ctx) { return { memories: await listAgentMemories(ctx.supabase, ctx.principal) }; },
  },
  {
    schema: { name: "remember_fact", description: "Explicitly save a durable preference or business fact after the user asks to remember it.", parameters: { type: "object", properties: { scope: scopeSchema, key: { type: "string" }, value: { type: "string" } }, required: ["scope", "key", "value"] } },
    mutating: true, risk: "low_mutation", requiredPermission: "agent:mutate:memory",
    async execute(ctx, args) { await rememberAgentFact(ctx.supabase, ctx.principal, { scope: String(args.scope) as any, key: String(args.key).slice(0, 120), value: String(args.value).slice(0, 1200) }); return { remembered: true }; },
  },
  {
    schema: { name: "forget_fact", description: "Delete an explicit durable memory when the user asks to forget it.", parameters: { type: "object", properties: { scope: scopeSchema, key: { type: "string" } }, required: ["scope", "key"] } },
    mutating: true, risk: "low_mutation", requiredPermission: "agent:mutate:memory",
    async execute(ctx, args) { return { forgotten: await forgetAgentFact(ctx.supabase, ctx.principal, { scope: String(args.scope) as any, key: String(args.key).slice(0, 120) }) }; },
    // VERIFICATION INTEGRITY (autonomous-convergence-loop mission, section
    // 10): forgetAgentFact returns false, without throwing, when no
    // matching non-deleted memory exists for that scope+key -- a real,
    // non-exceptional "there was nothing to forget" outcome the model
    // should never paraphrase as a bare "Done."
    interpretOutcome(result) {
      const r = result as { forgotten?: boolean } | null;
      if (r?.forgotten === false) return { status: "failed", detail: "no matching memory was found to forget" };
      return null;
    },
  },
];
