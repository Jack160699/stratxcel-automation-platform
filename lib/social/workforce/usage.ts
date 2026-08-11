/**
 * Usage accounting for Social publishes.
 * Consume purchased units only per existing counting policy.
 * Cross-post does not double-count unless PLATFORM_PUBLISH.
 */

export type SocialCountingPolicy = "CONTENT_UNIT" | "PLATFORM_PUBLISH";

export interface UsageConsumptionAttempt {
  tenantId: string;
  entitlementId: string;
  idempotencyKey: string;
  countingPolicy: SocialCountingPolicy;
  platforms: readonly string[];
  alreadyCountedForContentUnit?: boolean;
}

export interface UsageConsumptionDecision {
  consume: boolean;
  units: number;
  reason: string;
  idempotencyKey: string;
}

const settledKeys = new Set<string>();

/** Test helper — clear in-memory idempotency ledger. */
export function resetUsageIdempotencyLedgerForTests(): void {
  settledKeys.clear();
}

export function decideUsageConsumption(attempt: UsageConsumptionAttempt): UsageConsumptionDecision {
  if (settledKeys.has(attempt.idempotencyKey)) {
    return {
      consume: false,
      units: 0,
      reason: "already_settled",
      idempotencyKey: attempt.idempotencyKey,
    };
  }

  if (attempt.countingPolicy === "CONTENT_UNIT") {
    if (attempt.alreadyCountedForContentUnit) {
      return {
        consume: false,
        units: 0,
        reason: "content_unit_already_counted_cross_post",
        idempotencyKey: attempt.idempotencyKey,
      };
    }
    settledKeys.add(attempt.idempotencyKey);
    return {
      consume: true,
      units: 1,
      reason: "content_unit",
      idempotencyKey: attempt.idempotencyKey,
    };
  }

  const units = Math.max(1, new Set(attempt.platforms.map((p) => p.toLowerCase())).size);
  settledKeys.add(attempt.idempotencyKey);
  return {
    consume: true,
    units,
    reason: "platform_publish",
    idempotencyKey: attempt.idempotencyKey,
  };
}

export function markUsageSettled(idempotencyKey: string): void {
  settledKeys.add(idempotencyKey);
}
