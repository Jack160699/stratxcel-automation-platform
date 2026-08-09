/**
 * Pure logic behind buildBoundedOwnerContext's two safety guarantees —
 * split out (zero DB/env imports) so both are directly unit-testable.
 * See __tests__/hermes-context-boundary.test.ts.
 */
import { REQUIRES_CONFIRMATION, type ConfirmationState, type MemoryType } from "../types.ts";

export interface MemoryLike {
  id: string;
  memory_type: MemoryType;
  confirmation_state: ConfirmationState;
}

/**
 * "Never return UNCONFIRMED INFERRED_WORK_PATTERN memories" — an
 * unconfirmed inference must not silently steer a Hermes recommendation
 * as if it were settled. Every other memory type/state passes through.
 */
export function filterUsableMemories<T extends MemoryLike>(memories: T[]): T[] {
  return memories.filter((m) => !(REQUIRES_CONFIRMATION.includes(m.memory_type) && m.confirmation_state !== "CONFIRMED"));
}

/** Trims the memories array (cheapest field to drop) until the whole context serializes under maxChars — never truncates mid-object. */
export function capContextSize<T extends { memories: unknown[] }>(context: T, maxChars: number): T {
  let serialized = JSON.stringify(context);
  while (serialized.length > maxChars && context.memories.length > 0) {
    context.memories.pop();
    serialized = JSON.stringify(context);
  }
  return context;
}
