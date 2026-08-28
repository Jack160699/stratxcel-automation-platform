const PACKAGE_ERROR_COPY: Record<string, string> = {
  destination_removed_from_package_scope: "This platform was removed from Autopilot.",
  destination_account_tenant_mismatch: "This publishing account is assigned to another workspace.",
  subscription_inactive: "Your subscription is not active. Update billing to continue.",
  entitlement_paused_or_exhausted: "Your package is paused or has no remaining posts.",
  media_capability_unavailable: "The required media capability is not configured for this package.",
  account_disconnected: "Reconnect this social account to continue.",
  brand_binding_invalid: "Choose the correct Brand Brain for this workspace.",
  assignment_not_authorized: "You do not have permission to assign this resource to this workspace.",
  assignment_resource_not_found: "That Brand Brain or social account could not be found.",
  assignment_cross_tenant_reassignment: "This resource is already assigned to another workspace and cannot be moved here.",
  assignment_ambiguous_candidate: "More than one unassigned resource matches. Contact support to finish setup.",
  assignment_tenant_already_has_brand: "This workspace already has a Brand Brain assigned.",
  assignment_arbitrary_uuid_claim_rejected: "You cannot claim a resource you do not own.",
  package_configuration_required: "Your purchased package mix is not configured yet. Contact Stratxcel to finish setup before activating Autopilot.",
  invalid_schedule_wall_time: "Choose a valid date and time for this package.",
};

export function packageErrorForClient(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const key = Object.keys(PACKAGE_ERROR_COPY).find((candidate) => raw.includes(candidate));
  if (key) return PACKAGE_ERROR_COPY[key];
  // Hermes-Orchestrated Content Engine Hardening mission Section 3: a
  // platform rate limit (MetaApiError category "rate_limit" -- see
  // ../errors.ts) is real, transient, and already automatically retried by
  // worker.ts's own retry logic -- it must never read like the same
  // "something is broken, go fix your setup" copy a genuine configuration
  // problem gets, or a customer has no way to tell "this will resolve
  // itself" from "I need to do something."
  if (/rate.?limit(ed)?|too many requests|429/i.test(raw)) return "This platform is temporarily rate-limiting requests — Autopilot will retry automatically.";
  if (/token|connect|account unavailable/i.test(raw)) return "Reconnect this social account to continue.";
  return "Autopilot needs attention. Review its setup and try again.";
}
