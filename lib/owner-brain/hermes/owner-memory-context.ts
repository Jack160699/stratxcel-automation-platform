import { getServiceContext } from "../db-context";
import { listMemoriesForOwner } from "../repositories/memories";
import { listOpenLoopsForOwner } from "../repositories/open-loops";
import { getLatestReviewForOwner } from "../repositories/reviews-plans";
import { filterUsableMemories, capContextSize } from "./context-pure";

const MAX_MEMORIES = 25;
const MAX_SERIALIZED_CHARS = 4000;

export interface BoundedOwnerContext {
  memories: Array<{ category: string; statement: string; memoryType: string; confidence: number }>;
  openLoops: Array<{ item: string; dueDate: string | null }>;
  latestReview: { reviewDate: string; done: string | null; problems: string | null; moodEnergy: unknown } | null;
}

/**
 * "Server retrieves bounded approved memory -> builds scoped context ->
 * Hermes mission" (per the master brief's Hermes section) — this is that
 * retrieval step, and ONLY that step. It never returns the raw event
 * stream, filters out UNCONFIRMED INFERRED_WORK_PATTERN memories (see
 * filterUsableMemories in ./context-pure.ts), and hard-caps both item
 * count and serialized size (capContextSize) so a caller literally
 * cannot accidentally dump the whole owner_memories table into a prompt.
 * Both safety checks are pure functions in ./context-pure.ts, exercised
 * directly by __tests__/hermes-context-boundary.test.ts.
 */
export async function buildBoundedOwnerContext(ownerId: string): Promise<BoundedOwnerContext> {
  const service = getServiceContext().supabase;

  const [confirmedMemories, preferenceMemories, openLoops, latestReview] = await Promise.all([
    listMemoriesForOwner(service, ownerId, { confirmationState: "CONFIRMED", limit: MAX_MEMORIES }),
    listMemoriesForOwner(service, ownerId, { memoryType: "EXPLICIT_PREFERENCE", limit: MAX_MEMORIES }),
    listOpenLoopsForOwner(service, ownerId, "OPEN"),
    getLatestReviewForOwner(ownerId),
  ]);

  const byId = new Map<string, (typeof confirmedMemories)[number]>();
  for (const m of filterUsableMemories([...confirmedMemories, ...preferenceMemories])) {
    byId.set(m.id, m);
  }

  const memories = Array.from(byId.values())
    .slice(0, MAX_MEMORIES)
    .map((m) => ({ category: m.category, statement: m.statement, memoryType: m.memory_type, confidence: m.confidence }));

  const context: BoundedOwnerContext = {
    memories,
    openLoops: openLoops.slice(0, 10).map((l) => ({ item: l.item, dueDate: l.due_date })),
    latestReview: latestReview
      ? {
          reviewDate: latestReview.review_date,
          done: latestReview.done,
          problems: latestReview.problems,
          moodEnergy: latestReview.mood_energy,
        }
      : null,
  };

  return capContextSize(context, MAX_SERIALIZED_CHARS);
}
