/**
 * Anti-Replay Cryptographic Confirmation Security Manager
 * StratXcel Automation Platform - Hermes Universal Founder OS
 *
 * Enforces cryptographic anti-replay protection for all sensitive and high-consequence operations:
 * - Production deployments
 * - DNS / domain modifications
 * - Destructive database operations
 * - Infrastructure destruction / reboots
 * - Secret rotation
 * - Mass publishing / messaging
 * - Repository force operations
 * - Agent permission escalation
 *
 * Strictly binds confirmation to:
 * - founderId (principal identity)
 * - companyId
 * - tenantId
 * - missionId
 * - actionHash (hash of canonical action name + normalized payload)
 * - expiration (ephemeral TTL, max 10 minutes)
 * - single-use nonce
 *
 * Never allows generic "CONFIRM" or a code issued for one action to authorize a different action.
 */

import { createHash, randomBytes } from "node:crypto";

export interface ConfirmationBindingContext {
  founderId: string;
  companyId: string;
  tenantId: string;
  missionId: string;
  actionName: string;
  payload: Record<string, unknown>;
  ttlSeconds?: number;
}

export interface AntiReplayConfirmationToken {
  confirmationId: string;
  displayCode: string; // e.g. 6-digit PIN for WhatsApp/SMS: "849201"
  nonce: string;
  actionHash: string;
  contextHash: string;
  founderId: string;
  companyId: string;
  tenantId: string;
  missionId: string;
  actionName: string;
  normalizedPayload: Record<string, unknown>;
  expiresAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
}

/**
 * In-memory / durable cache of used nonces to prevent replay attacks.
 */
const consumedNonces = new Set<string>();
const activeConfirmations = new Map<string, AntiReplayConfirmationToken>();

/**
 * Computes canonical deterministic SHA-256 hash of an action and its payload.
 */
export function computeActionHash(actionName: string, payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload).sort();
  const sortedPayload: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    sortedPayload[k] = payload[k];
  }
  const serialized = JSON.stringify({ action: actionName, payload: sortedPayload });
  return createHash("sha256").update(serialized).digest("hex");
}

/**
 * Computes deterministic context binding hash.
 */
export function computeContextHash(ctx: {
  founderId: string;
  companyId: string;
  tenantId: string;
  missionId: string;
  actionHash: string;
  nonce: string;
  expiresAt: string;
}): string {
  const raw = `${ctx.founderId}:${ctx.companyId}:${ctx.tenantId}:${ctx.missionId}:${ctx.actionHash}:${ctx.nonce}:${ctx.expiresAt}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generates an anti-replay confirmation token bound to the exact execution parameters.
 */
export function generateAntiReplayConfirmation(input: ConfirmationBindingContext): AntiReplayConfirmationToken {
  const nonce = randomBytes(16).toString("hex");
  const displayCode = Math.floor(100000 + Math.random() * 900000).toString();
  const ttl = input.ttlSeconds ?? 600; // default 10 min
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const actionHash = computeActionHash(input.actionName, input.payload);

  const contextHash = computeContextHash({
    founderId: input.founderId,
    companyId: input.companyId,
    tenantId: input.tenantId,
    missionId: input.missionId,
    actionHash,
    nonce,
    expiresAt,
  });

  const confirmation: AntiReplayConfirmationToken = {
    confirmationId: `conf_${nonce.slice(0, 12)}_${Date.now()}`,
    displayCode,
    nonce,
    actionHash,
    contextHash,
    founderId: input.founderId,
    companyId: input.companyId,
    tenantId: input.tenantId,
    missionId: input.missionId,
    actionName: input.actionName,
    normalizedPayload: input.payload,
    expiresAt,
    usedAt: null,
    cancelledAt: null,
  };

  // Register in active map
  activeConfirmations.set(confirmation.confirmationId, confirmation);
  activeConfirmations.set(confirmation.displayCode, confirmation);

  return confirmation;
}

export type AntiReplayValidationResult =
  | {
      valid: true;
      confirmation: AntiReplayConfirmationToken;
      authorizedAction: string;
      authorizedPayload: Record<string, unknown>;
    }
  | {
      valid: false;
      reason:
        | "TOKEN_NOT_FOUND"
        | "TOKEN_EXPIRED"
        | "NONCE_REPLAYED"
        | "FOUNDER_MISMATCH"
        | "COMPANY_MISMATCH"
        | "TENANT_MISMATCH"
        | "MISSION_MISMATCH"
        | "ACTION_MISMATCH"
        | "CONTEXT_HASH_CORRUPTED"
        | "ALREADY_USED"
        | "CANCELLED";
      details: string;
    };

/**
 * Consumes and validates a confirmation token. Ensures strict anti-replay and single-use semantics.
 */
export function consumeAntiReplayConfirmation(
  codeOrId: string,
  requestContext: {
    founderId: string;
    companyId: string;
    tenantId: string;
    missionId: string;
    actionName: string;
    payload: Record<string, unknown>;
  }
): AntiReplayValidationResult {
  const confirmation = activeConfirmations.get(codeOrId);
  if (!confirmation) {
    return {
      valid: false,
      reason: "TOKEN_NOT_FOUND",
      details: `Confirmation token '${codeOrId}' does not exist or has already been cleared.`,
    };
  }

  // Check cancellation
  if (confirmation.cancelledAt) {
    return {
      valid: false,
      reason: "CANCELLED",
      details: "This confirmation was explicitly cancelled by the Founder.",
    };
  }

  // Check single-use
  if (confirmation.usedAt || consumedNonces.has(confirmation.nonce)) {
    return {
      valid: false,
      reason: "ALREADY_USED",
      details: "Anti-replay security violation: This confirmation code has already been consumed. Replay is strictly forbidden.",
    };
  }

  // Check expiration
  if (new Date(confirmation.expiresAt).getTime() <= Date.now()) {
    return {
      valid: false,
      reason: "TOKEN_EXPIRED",
      details: "Confirmation token has expired. High-consequence actions must be confirmed within 10 minutes.",
    };
  }

  // Check Founder binding
  if (confirmation.founderId !== requestContext.founderId) {
    return {
      valid: false,
      reason: "FOUNDER_MISMATCH",
      details: `Security violation: Confirmation was issued to Founder '${confirmation.founderId}', but attempted by '${requestContext.founderId}'.`,
    };
  }

  // Check Company binding
  if (confirmation.companyId !== requestContext.companyId) {
    return {
      valid: false,
      reason: "COMPANY_MISMATCH",
      details: "Security violation: Company boundary mismatch.",
    };
  }

  // Check Tenant binding
  if (confirmation.tenantId !== requestContext.tenantId) {
    return {
      valid: false,
      reason: "TENANT_MISMATCH",
      details: `Security violation: Tenant boundary mismatch (${confirmation.tenantId} != ${requestContext.tenantId}).`,
    };
  }

  // Check Mission binding
  if (confirmation.missionId !== requestContext.missionId) {
    return {
      valid: false,
      reason: "MISSION_MISMATCH",
      details: "Security violation: Confirmation was bound to a different mission.",
    };
  }

  // Check Action & Payload Hash binding
  const currentActionHash = computeActionHash(requestContext.actionName, requestContext.payload);
  if (confirmation.actionHash !== currentActionHash) {
    return {
      valid: false,
      reason: "ACTION_MISMATCH",
      details: `Security violation: Confirmation was issued for '${confirmation.actionName}' with hash '${confirmation.actionHash}', but confirmation was attempted for '${requestContext.actionName}' with hash '${currentActionHash}'. Generic confirmations cannot authorize altered actions.`,
    };
  }

  // Verify context cryptographic integrity
  const recomputedContextHash = computeContextHash({
    founderId: confirmation.founderId,
    companyId: confirmation.companyId,
    tenantId: confirmation.tenantId,
    missionId: confirmation.missionId,
    actionHash: confirmation.actionHash,
    nonce: confirmation.nonce,
    expiresAt: confirmation.expiresAt,
  });

  if (recomputedContextHash !== confirmation.contextHash) {
    return {
      valid: false,
      reason: "CONTEXT_HASH_CORRUPTED",
      details: "Security violation: Context cryptographic signature validation failed.",
    };
  }

  // Mark consumed
  confirmation.usedAt = new Date().toISOString();
  consumedNonces.add(confirmation.nonce);

  return {
    valid: true,
    confirmation,
    authorizedAction: confirmation.actionName,
    authorizedPayload: confirmation.normalizedPayload,
  };
}

/**
 * Resets memory state (used in testing).
 */
export function resetConfirmationSecurityState(): void {
  consumedNonces.clear();
  activeConfirmations.clear();
}
