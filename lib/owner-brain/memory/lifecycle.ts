import { getServiceContext } from "../db-context";
import { createMemory, listMemoriesForOwner, reinforceMemory } from "../repositories/memories";
import { AUTO_EXPIRES, type ConfirmationState, type MemoryType } from "../types";
import { defaultExpiryFor, clamp01, isDuplicateStatement } from "./pure";

export type { MemoryType };
export { defaultExpiryFor, clamp01, isDuplicateStatement };

export interface MemoryCandidate {
  category: string;
  statement: string;
  memoryType: MemoryType;
  /** 0..1 — how strongly the evidence for this candidate supports it. Distinct from confirmation_state, which tracks owner sign-off, not evidence strength. */
  confidence: number;
  provenance: { eventId?: string; sourceId?: string; note?: string };
}

/**
 * The full event -> normalization -> classification -> candidate ->
 * dedupe -> confidence -> confirmation -> durable-memory pipeline in one
 * place. Classification itself (turning an event into a MemoryCandidate)
 * is intentionally NOT here — that's source-specific (see
 * connectors/*.ts, which call this with their own candidates) — this
 * module owns the policy that's the same regardless of where a candidate
 * came from:
 *
 *   - INFERRED_WORK_PATTERN candidates always start UNCONFIRMED and never
 *     silently become a fact — see REQUIRES_CONFIRMATION.
 *   - TEMPORARY_CONTEXT candidates always get an expiry — see AUTO_EXPIRES.
 *   - A near-duplicate statement in the same category reinforces the
 *     existing memory (bumps confidence + last_observed_at) instead of
 *     creating a new row.
 *
 * The actual pure decision functions (dedupe predicate, confidence
 * clamp, expiry policy) live in ./pure.ts, which has zero DB/env
 * dependencies and is what __tests__/memory-lifecycle.test.ts exercises
 * directly — this file is the I/O wiring around them.
 */
export async function admitMemoryCandidate(ownerId: string, candidate: MemoryCandidate): Promise<{ memoryId: string; created: boolean }> {
  // Every candidate starts UNCONFIRMED, full stop — confirmation only ever
  // happens via an explicit owner Accept (applyMemoryFeedback). What
  // REQUIRES_CONFIRMATION actually gates is downstream: retrieval for
  // planning/Hermes context (see hermes/owner-memory-context.ts) excludes
  // UNCONFIRMED INFERRED_WORK_PATTERN memories so an unconfirmed inference
  // never quietly drives a recommendation as if it were settled.
  const confirmationState: ConfirmationState = "UNCONFIRMED";

  const expiresAt = AUTO_EXPIRES.includes(candidate.memoryType) ? defaultExpiryFor(candidate.memoryType) : null;

  const existing = await findDedupeMatch(ownerId, candidate);
  if (existing) {
    await reinforceMemory(existing.id, 0.05);
    return { memoryId: existing.id, created: false };
  }

  const memoryId = await createMemory({
    ownerId,
    category: candidate.category,
    statement: candidate.statement,
    memoryType: candidate.memoryType,
    confidence: clamp01(candidate.confidence),
    confirmationState,
    expiresAt,
    provenance: candidate.provenance,
  });
  return { memoryId, created: true };
}

async function findDedupeMatch(ownerId: string, candidate: MemoryCandidate) {
  const nearby = await listMemoriesForOwner(getServiceContext().supabase, ownerId, {
    category: candidate.category,
    memoryType: candidate.memoryType,
    limit: 50,
  });
  return nearby.find((m) => isDuplicateStatement(m.statement, candidate.statement));
}
