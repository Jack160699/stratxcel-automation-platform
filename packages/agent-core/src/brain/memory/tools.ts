import type { AgentTool } from "../../tools/contract.ts";
import { forgetAgentFact, listAgentMemories, rememberAgentFact, MEMORY_CONFIDENCE_VALUES, type MemoryConfidence } from "./repository.ts";

const scopeSchema = { type: "string", enum: ["personal", "workspace", "agency"] };
const confidenceSchema = {
  type: "string",
  enum: MEMORY_CONFIDENCE_VALUES,
  description:
    "How sure this memory actually is (Section 19: never treat an assumption as a verified fact) -- FACT (a human directly stated it), VERIFIED (independently confirmed, e.g. by research), OBSERVATION (directly observed system/business state), INFERENCE (reasoned/derived, not confirmed), PREFERENCE (a stated preference, not a fact), EXPERIMENT (a hypothesis being tested), or UNKNOWN if genuinely unsure. Omitting this defaults to UNKNOWN -- never guess FACT/VERIFIED to sound more certain.",
};

function isMemoryConfidence(value: unknown): value is MemoryConfidence {
  return typeof value === "string" && (MEMORY_CONFIDENCE_VALUES as readonly string[]).includes(value);
}

export const MEMORY_TOOLS: AgentTool[] = [
  {
    schema: { name: "recall_memory", description: "Recall explicit preferences or facts saved in authorized personal/workspace memory, each with its real confidence classification.", parameters: { type: "object", properties: {} } },
    mutating: false, risk: "read", requiredPermission: "agent:read:memory",
    async execute(ctx) { return { memories: await listAgentMemories(ctx.supabase, ctx.principal) }; },
  },
  {
    schema: { name: "remember_fact", description: "Explicitly save a durable preference or business fact after the user asks to remember it. Always set confidence honestly -- never default to sounding more certain than you are.", parameters: { type: "object", properties: { scope: scopeSchema, key: { type: "string" }, value: { type: "string" }, confidence: confidenceSchema }, required: ["scope", "key", "value"] } },
    mutating: true, risk: "low_mutation", requiredPermission: "agent:mutate:memory",
    async execute(ctx, args) {
      const confidence = isMemoryConfidence(args.confidence) ? args.confidence : undefined;
      await rememberAgentFact(ctx.supabase, ctx.principal, { scope: String(args.scope) as any, key: String(args.key).slice(0, 120), value: String(args.value).slice(0, 1200), confidence });
      return { remembered: true, confidence: confidence ?? "UNKNOWN" };
    },
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
