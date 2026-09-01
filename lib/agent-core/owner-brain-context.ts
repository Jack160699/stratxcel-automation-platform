/**
 * Bridges a real, mature, already-tested engine the Master Brain
 * requirement asks for by name ("the Brain must know our philosophy,
 * our rules, our priorities, our goals, our decisions, our outcomes,
 * what worked, what failed, what was learned") into runAgentTurn's Brain
 * context (packages/agent-core/src/brain/context-builder.ts's new,
 * additive extraKnowledge input) -- WITHOUT building a second memory
 * system. lib/owner-brain already IS that system: real FACT/
 * EXPLICIT_PREFERENCE/DECISION/LESSON/OPEN_LOOP memories with a
 * confirmation lifecycle (an inference never silently becomes a durable
 * fact -- see lib/owner-brain/memory/lifecycle.ts), real daily
 * reviews, real open loops -- fed by real connectors (Gmail, Calendar,
 * Notion, GitHub, Stratxcel's own admin/internal events).
 *
 * The retrieval used here, buildBoundedOwnerContext, is not new either
 * -- it is the exact same bounded, size-capped, confirmation-filtered
 * function lib/owner-brain/hermes/owner-memory-context.ts already built
 * and tested (__tests__/hermes-context-boundary.test.ts) for Hermes
 * missions ("server retrieves bounded approved memory -> builds scoped
 * context -> mission", per that file's own docstring). This applies the
 * identical safety discipline to a second real consumer (the WhatsApp/
 * Admin Copilot Brain turn) rather than reimplementing it.
 *
 * Owner-brain data is per-authUserId (every repository call is
 * `.eq("owner_id", ownerId)`-scoped, verified directly in the source
 * before this file was written) -- so a staff principal only ever sees
 * their OWN confirmed memories/decisions/open-loops, never another
 * staff member's, and a staff member with no stratxcel_admins row (most
 * narrower roles) safely gets an empty context, not an error. Client
 * principals never call this at all -- owner-brain is explicitly
 * single-owner/admin data, not tenant data (see lib/owner-brain/types.ts's
 * header comment).
 */
import { buildBoundedOwnerContext } from "@/lib/owner-brain/hermes/owner-memory-context";
import type { AgentPrincipal } from "@stratxcel/agent-core";

export async function loadOwnerBrainKnowledge(principal: AgentPrincipal): Promise<string[]> {
  if (principal.kind !== "staff") return [];
  try {
    const ctx = await buildBoundedOwnerContext(principal.authUserId);
    const parts: string[] = [];
    if (ctx.memories.length) {
      parts.push(
        `Owner memory (your own confirmed facts, preferences, decisions, and lessons -- never invent one, never state one you don't see here):\n${ctx.memories
          .map((m) => `- [${m.memoryType}/${m.category}] ${m.statement}`)
          .join("\n")}`
      );
    }
    if (ctx.openLoops.length) {
      parts.push(
        `Your open loops (unfinished items you tracked, not yet done or dropped):\n${ctx.openLoops
          .map((l) => `- ${l.item}${l.dueDate ? ` (due ${l.dueDate})` : ""}`)
          .join("\n")}`
      );
    }
    if (ctx.latestReview) {
      const r = ctx.latestReview;
      parts.push(
        `Your latest daily review (${r.reviewDate}): ${[r.done && `done: ${r.done}`, r.problems && `problems: ${r.problems}`].filter(Boolean).join("; ") || "no notes recorded"}`
      );
    }
    return parts;
  } catch {
    // Never let owner-brain unavailability (e.g. no stratxcel_admins row,
    // a transient query failure) block or degrade the agent turn itself --
    // this is supplementary context, not a required dependency.
    return [];
  }
}
