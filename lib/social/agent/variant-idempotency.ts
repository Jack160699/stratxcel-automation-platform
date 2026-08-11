/**
 * Deterministic variant generation identity + reuse.
 * Caption text alone is never the idempotency key.
 */

import { createHash } from "node:crypto";

export interface VariantGenerationIdentity {
  tenantId: string;
  missionId: string;
  sessionId: string;
  contentSlot: string;
  masterId: string;
  platform: string;
  format: string;
  briefVersion: string;
  revision: number;
}

export function buildVariantGenerationKey(identity: VariantGenerationIdentity): string {
  const canonical = [
    identity.tenantId,
    identity.missionId,
    identity.sessionId,
    identity.contentSlot,
    identity.masterId,
    identity.platform.toLowerCase(),
    identity.format.toLowerCase(),
    identity.briefVersion,
    String(identity.revision),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export interface IdempotentVariantRecord {
  id: string;
  generationKey: string;
  platform: string;
  masterId: string;
  revision: number;
}

/**
 * Pure lookup: if a variant with the same generation key already exists for this
 * review revision, reuse it (no second AI call / insert).
 */
export function findExistingVariantByGenerationKey(
  existing: readonly IdempotentVariantRecord[],
  generationKey: string,
): IdempotentVariantRecord | null {
  return existing.find((row) => row.generationKey === generationKey) ?? null;
}
