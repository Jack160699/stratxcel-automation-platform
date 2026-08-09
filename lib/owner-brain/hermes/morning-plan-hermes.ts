import { buildBoundedOwnerContext } from "./owner-memory-context";

export interface HermesAssistResult {
  used: boolean;
  reason?: string;
}

/**
 * Deliberately NOT wired to a live Hermes mission in this pass. Why:
 * packages/hermes's HermesRuntimeAdapter.execute() requires a real,
 * persisted, tenant-scoped MissionRow (packages/missions) and a signed
 * mission token (packages/hermes/src/token.ts + signing.ts) — the entire
 * pipeline is built around "one tenant's mission", and Owner Operating
 * Brain data has no tenant (it's the owner's own cross-tenant data).
 * Bolting a synthetic/borrowed tenant_id onto that pipeline under time
 * pressure, without exercising it against the real mission-worker queue
 * and signing/verification path, is exactly the kind of change the master
 * brief's "do not destabilize Hermes" / "do not rebuild Hermes" rules
 * exist to prevent.
 *
 * The safe, narrow integration seam this leaves ready for a follow-up
 * pass: buildBoundedOwnerContext() below already does the one thing the
 * brief actually asks for here ("server retrieves bounded approved
 * memory -> builds scoped context") — a future change only needs to (1)
 * designate a real internal tenant_id for Stratxcel's own agency
 * operations (via OWNER_BRAIN_HERMES_TENANT_ID), (2) compile a mission
 * through the existing packages/missions compiler with profile
 * "stratxcel-admin-growth" and this bounded context as its goal input,
 * and (3) read the recommendation back from mission events — reusing
 * 100% of the existing Hermes security path, adding zero new tools to
 * the gateway's allowlist.
 *
 * Until then, generateAndSaveMorningPlan() in planner/morning-plan.ts
 * always uses the deterministic rules-based generator — this function
 * exists so that seam is documented and the bounded-context builder is
 * exercised (and tested) even though nothing downstream reads it yet.
 */
export async function attemptHermesAssistedPlan(ownerId: string): Promise<HermesAssistResult> {
  const tenantId = process.env.OWNER_BRAIN_HERMES_TENANT_ID;
  if (!tenantId) {
    return { used: false, reason: "OWNER_BRAIN_HERMES_TENANT_ID not configured — see MANUAL ACTIONS in the build report" };
  }
  // Bounded context is still built (and thus still tested/exercised) even
  // though nothing consumes it yet — keeps this function's one real
  // dependency live rather than dead code behind the env check above.
  await buildBoundedOwnerContext(ownerId);
  return { used: false, reason: "Hermes mission wiring intentionally not implemented this pass — see file header" };
}
