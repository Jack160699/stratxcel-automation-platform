/**
 * Pure, dependency-free memory-lifecycle logic — deliberately split out of
 * lifecycle.ts (which imports the DB-touching repositories) so these
 * functions can be unit-tested by running this file directly under plain
 * Node, with no Supabase client, no env vars, and no module-resolution
 * dependency on the rest of the app. See __tests__/memory-lifecycle.test.ts.
 */
import type { MemoryType } from "../types";

export function defaultExpiryFor(memoryType: MemoryType, nowMs = Date.now()): string {
  // Self-reported temporary context (mood/energy for "today") decays after 48h by default.
  const hours = memoryType === "TEMPORARY_CONTEXT" ? 48 : 24;
  return new Date(nowMs + hours * 60 * 60 * 1000).toISOString();
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Pragmatic dedupe predicate: case-insensitive substring match in either
 * direction. Cheap, explainable, no embeddings — sufficient at
 * single-owner data volume. A semantic/pgvector upgrade is a drop-in
 * replacement for this one function if false negatives become a real
 * problem.
 */
export function isDuplicateStatement(existingStatement: string, candidateStatement: string): boolean {
  const existing = existingStatement.trim().toLowerCase();
  const target = candidateStatement.trim().toLowerCase();
  if (!existing || !target) return false;
  return existing.includes(target) || target.includes(existing);
}
