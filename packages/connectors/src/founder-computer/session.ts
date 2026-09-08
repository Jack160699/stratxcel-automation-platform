/**
 * Founder Computer — Session Management
 *
 * Single source of truth for the Founder Computer browser session state.
 * Session data is stored in the connector_connections row metadata field.
 *
 * SECURITY: Raw cookies, tokens, and session data are NEVER exposed through
 * this module. Only status, metadata, and authenticated domain lists are returned.
 * The actual session secret is stored exclusively in encrypted_secret_ref via the
 * connector vault and is accessible only to the browser runtime.
 */

import type { FounderComputerSessionStatus } from "../types.ts";

export type FounderControlLock = "AVAILABLE" | "FOUNDER_CONTROL" | "HERMES_CONTROL" | "LOCKED";

export interface FounderComputerSession {
  /** Unique profile identifier for this session. Stable across restarts. */
  profileId: string;
  /** Current session status. */
  status: FounderComputerSessionStatus;
  /** Canonical session state machine state. */
  sessionStatus?: "NOT_CONFIGURED" | "RUNTIME_OFFLINE" | "AUTH_REQUIRED" | "AUTHENTICATED" | "DEGRADED" | "REQUIRES_REAUTH" | "ERROR";
  /** Domains/services the Founder has authenticated within the profile. */
  authenticatedDomains: string[];
  /** Safe identifier of the authenticated Google account (e.g. "user@example.com"). Never a password or token. */
  authenticatedGoogleAccount?: string | null;
  /** ISO timestamp of last successful session verification. */
  lastVerifiedAt: string | null;
  /** Opaque reference to the runtime host (e.g. EC2 instance ID). Never a password. */
  runtimeHostRef: string | null;
  /** Browser version string (e.g. "Chromium 120"). */
  browserVersion: string | null;
  /** ISO timestamp when the session was first established. */
  connectedAt: string | null;
  /** Whether the session is considered healthy (verified within 24 hours). */
  isHealthy: boolean;
  /** Mutual exclusion lock between Founder manual view and Hermes autonomous automation. */
  controlLock: FounderControlLock;
  /** Whether a remote viewer session is actively attached. */
  viewerActive: boolean;
  /** ISO timestamp when the current viewer authorization expires. */
  viewerExpiresAt: string | null;
}

/**
 * Session TTL in milliseconds. Sessions not re-verified within this window
 * are considered degraded and transition to requires_reauth.
 */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Parses raw connector_connection metadata into a typed FounderComputerSession.
 * Returns null if the metadata does not contain a valid session.
 */
export function parseFounderComputerSession(
  metadata: Record<string, unknown> | null | undefined
): FounderComputerSession | null {
  if (!metadata) return null;

  const profileId = typeof metadata.profileId === "string" ? metadata.profileId : null;
  if (!profileId) return null;

  const rawStatus = (metadata.sessionStatus as string) ?? "auth_required";
  const status: FounderComputerSessionStatus =
    rawStatus === "AUTHENTICATED" || rawStatus.toLowerCase() === "authenticated" || rawStatus === "ready"
      ? "ready"
      : (rawStatus as FounderComputerSessionStatus);

  const sessionStatus =
    rawStatus === "AUTHENTICATED" || status === "ready"
      ? "AUTHENTICATED"
      : status === "auth_required"
      ? "AUTH_REQUIRED"
      : status === "expired"
      ? "REQUIRES_REAUTH"
      : (rawStatus as any);

  const lastVerifiedAt = typeof metadata.lastVerifiedAt === "string" ? metadata.lastVerifiedAt : null;
  const connectedAt = typeof metadata.connectedAt === "string" ? metadata.connectedAt : null;
  const runtimeHostRef = typeof metadata.runtimeHostRef === "string" ? metadata.runtimeHostRef : null;
  const browserVersion = typeof metadata.browserVersion === "string" ? metadata.browserVersion : null;

  const authenticatedDomains: string[] = Array.isArray(metadata.authenticatedDomains)
    ? (metadata.authenticatedDomains as string[]).filter((d) => typeof d === "string")
    : [];

  const authenticatedGoogleAccount =
    typeof metadata.authenticatedGoogleAccount === "string" && metadata.authenticatedGoogleAccount.includes("@")
      ? metadata.authenticatedGoogleAccount
      : null;

  const isHealthy =
    (status === "ready" || sessionStatus === "AUTHENTICATED") &&
    lastVerifiedAt !== null &&
    Date.now() - new Date(lastVerifiedAt).getTime() < SESSION_TTL_MS;

  const controlLock = (metadata.controlLock as FounderControlLock) ?? "AVAILABLE";
  const viewerActive = Boolean(metadata.viewerActive);
  const viewerExpiresAt = typeof metadata.viewerExpiresAt === "string" ? metadata.viewerExpiresAt : null;

  return {
    profileId,
    status,
    sessionStatus,
    authenticatedDomains,
    authenticatedGoogleAccount,
    lastVerifiedAt,
    runtimeHostRef,
    browserVersion,
    connectedAt,
    isHealthy,
    controlLock,
    viewerActive,
    viewerExpiresAt,
  };
}

/**
 * Derives the ConnectorHealthStatus from a FounderComputerSession.
 * Used by the health probe in packages/connectors/src/health.ts.
 */
export function deriveHealthStatusFromSession(
  session: FounderComputerSession | null
): "not_configured" | "auth_required" | "connected" | "healthy" | "degraded" | "requires_reauth" | "disconnected" {
  if (!session) return "not_configured";

  switch (session.status) {
    case "not_configured":
      return "not_configured";
    case "auth_required":
      return "auth_required";
    case "connected":
      return "connected";
    case "ready": {
      if (!session.lastVerifiedAt) return "connected";
      const age = Date.now() - new Date(session.lastVerifiedAt).getTime();
      if (age > SESSION_TTL_MS) return "degraded";
      return "healthy";
    }
    case "degraded":
      return "degraded";
    case "expired":
      return "requires_reauth";
    case "disconnected":
      return "disconnected";
    default:
      return "not_configured";
  }
}

/**
 * Returns the list of capabilities discoverable from a session.
 * Only returns capabilities that are genuinely reachable given the session's
 * authenticated domains — never fabricates availability.
 */
export function deriveCapabilitiesFromSession(session: FounderComputerSession | null): string[] {
  if (!session || (session.status !== "ready" && session.status !== "connected")) {
    return [];
  }

  // Base browser primitives are always available once the session is connected
  const base = [
    "browser.navigate",
    "browser.click",
    "browser.type",
    "browser.select",
    "browser.scroll",
    "browser.wait",
    "browser.screenshot",
    "browser.read",
    "browser.upload",
    "browser.download",
    "browser.tabs",
    "browser.close",
    "computer.screenshot",
    "file.transfer_to_stratxcel",
    "file.transfer_to_browser",
  ];

  // Domain-specific capabilities are only surfaced if the domain is authenticated
  const extras: string[] = [];
  const domains = session.authenticatedDomains.map((d) => d.toLowerCase());

  if (domains.some((d) => d.includes("google.com") || d.includes("accounts.google"))) {
    extras.push("computer.open_app", "computer.type", "computer.key", "computer.wait");
  }

  return [...base, ...extras];
}

/**
 * Builds the metadata object to persist when initializing a new Founder Computer session.
 * Call this when the Founder clicks "Connect" to create the initial session record.
 */
export function buildInitialSessionMetadata(opts: {
  profileId: string;
  runtimeHostRef?: string | null;
}): Record<string, unknown> {
  return {
    profileId: opts.profileId,
    sessionStatus: "auth_required" satisfies FounderComputerSessionStatus,
    authenticatedDomains: [],
    lastVerifiedAt: null,
    connectedAt: new Date().toISOString(),
    runtimeHostRef: opts.runtimeHostRef ?? null,
    browserVersion: null,
    setupInstructions: [
      "Start the secure browser runtime on the configured host.",
      "Navigate to the accounts you want to authorize (e.g. accounts.google.com).",
      "Complete sign-in manually — StratXcel never receives your password.",
      "Return to Admin and click 'Verify Session' to confirm the session.",
      "Click 'Discover Capabilities' to identify available services.",
    ],
  };
}

/**
 * Builds the metadata patch to apply after the Founder verifies the session.
 */
export function buildSessionVerifiedMetadata(opts: {
  existing: Record<string, unknown>;
  authenticatedDomains: string[];
  authenticatedGoogleAccount?: string | null;
  browserVersion?: string | null;
  runtimeHostRef?: string | null;
}): Record<string, unknown> {
  return {
    ...opts.existing,
    sessionStatus: "ready" satisfies FounderComputerSessionStatus,
    authenticatedDomains: opts.authenticatedDomains,
    authenticatedGoogleAccount:
      opts.authenticatedGoogleAccount !== undefined
        ? opts.authenticatedGoogleAccount
        : opts.existing.authenticatedGoogleAccount ?? null,
    lastVerifiedAt: new Date().toISOString(),
    browserVersion: opts.browserVersion ?? opts.existing.browserVersion ?? null,
    runtimeHostRef: opts.runtimeHostRef ?? opts.existing.runtimeHostRef ?? null,
  };
}

/**
 * Builds the metadata patch when a Founder opens the remote browser viewer.
 */
export function buildViewerSessionMetadata(opts: {
  existing: Record<string, unknown>;
  expiresAt: string;
}): Record<string, unknown> {
  return {
    ...opts.existing,
    controlLock: "FOUNDER_CONTROL" satisfies FounderControlLock,
    viewerActive: true,
    viewerExpiresAt: opts.expiresAt,
    lastViewerOpenedAt: new Date().toISOString(),
  };
}

/**
 * Builds the metadata patch when the Founder closes or releases the remote browser viewer.
 */
export function buildReleaseViewerMetadata(existing: Record<string, unknown>): Record<string, unknown> {
  return {
    ...existing,
    controlLock: "AVAILABLE" satisfies FounderControlLock,
    viewerActive: false,
    viewerExpiresAt: null,
    lastViewerClosedAt: new Date().toISOString(),
  };
}

/**
 * Generates a stable profile ID for a new Founder Computer session.
 * Uses a prefix + timestamp to guarantee uniqueness.
 * No random secrets — this is just an identifier, not a token.
 */
export function generateProfileId(): string {
  return `fc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Throws an error if Founder Control is actively locking the browser.
 * Protects manual Founder sessions from concurrent programmatic Hermes actions.
 */
export function assertFounderBrowserAvailableForHermes(
  metadata: Record<string, unknown> | null | undefined
): void {
  if (!metadata) return;
  const lock = (metadata.controlLock as string) || "AVAILABLE";
  if (lock === "FOUNDER_CONTROL") {
    const error = new Error(
      "Founder is currently interacting with the browser (Founder Control is active). Hermes automation is temporarily paused."
    );
    (error as any).code = "founder_control_active";
    throw error;
  }
}

