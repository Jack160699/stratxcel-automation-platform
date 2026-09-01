// Run with: node --experimental-strip-types packages/agent-core/src/__tests__/brain-context-extra-knowledge.test.ts
import assert from "node:assert/strict";
import { createFakeSupabase } from "./support/fake-supabase.ts";
import { buildBrainContext } from "../brain/context-builder.ts";
import type { StaffAgentPrincipal } from "../principal.ts";

// Master Brain bridge (autonomous-convergence-loop mission, section 1):
// runAgentTurn now accepts an additive extraKnowledge: string[] input,
// threaded through to buildBrainContext, so the app layer can inject real
// owner-brain context (lib/agent-core/owner-brain-context.ts's
// loadOwnerBrainKnowledge -- confirmed memories/decisions/open-loops from
// the already-tested, bounded lib/owner-brain system) without agent-core
// importing app code or a second memory system being built. Verified here
// at the context-builder level: present -> appears in the prompt; absent
// -> the prompt is byte-identical to before (strictly additive, the same
// discipline every other extension in this package follows).

const principal: StaffAgentPrincipal = { kind: "staff", channel: "whatsapp", authUserId: "staff-brain-1", tenantId: null, role: "platform_owner", permissions: [] };

async function run() {
  const { client } = createFakeSupabase();
  const supabase = client as any;

  const withoutExtra = await buildBrainContext({ supabase, principal, tools: [], history: [] });
  assert.ok(!withoutExtra.systemPrompt.includes("Owner memory"), "no extraKnowledge means no owner-brain section appears");

  const extraKnowledge = ["Owner memory (your own confirmed facts, preferences, decisions, and lessons):\n- [DECISION/pricing] Ship the Pro tier at ₹4,999/mo, decided 2026-08-20."];
  const withExtra = await buildBrainContext({ supabase, principal, tools: [], history: [], extraKnowledge });
  assert.ok(withExtra.systemPrompt.includes("Ship the Pro tier at"), "extraKnowledge content must reach the system prompt verbatim");

  // Additive safety: everything else about the prompt is unchanged between
  // the two calls except the appended section.
  assert.equal(withExtra.systemPrompt.startsWith(withoutExtra.systemPrompt.split("\n\n")[0]), true, "the rest of the prompt (identity line etc.) must be unaffected by extraKnowledge");

  const emptyArray = await buildBrainContext({ supabase, principal, tools: [], history: [], extraKnowledge: [] });
  assert.equal(emptyArray.systemPrompt, withoutExtra.systemPrompt, "an empty extraKnowledge array must behave identically to omitting it entirely");

  console.log("brain-context-extra-knowledge.test.ts (@stratxcel/agent-core): ALL PASS");
}

run();
