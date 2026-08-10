const PACKAGE_ERROR_COPY: Record<string, string> = {
  destination_removed_from_package_scope: "This platform was removed from Autopilot.",
  destination_account_tenant_mismatch: "This publishing account is assigned to another workspace.",
  subscription_inactive: "Your subscription is not active. Update billing to continue.",
  entitlement_paused_or_exhausted: "Your package is paused or has no remaining posts.",
  media_capability_unavailable: "The required media capability is not configured for this package.",
  account_disconnected: "Reconnect this social account to continue.",
  brand_binding_invalid: "Choose the correct Brand Brain for this workspace.",
};

export function packageErrorForClient(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const key = Object.keys(PACKAGE_ERROR_COPY).find((candidate) => raw.includes(candidate));
  if (key) return PACKAGE_ERROR_COPY[key];
  if (/token|connect|account unavailable/i.test(raw)) return "Reconnect this social account to continue.";
  return "Autopilot needs attention. Review its setup and try again.";
}
