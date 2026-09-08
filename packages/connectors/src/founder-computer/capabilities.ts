/**
 * Founder Computer — Capability Discovery
 *
 * Classifies potential browser/computer capabilities as AVAILABLE, REQUIRES_AUTH,
 * AVAILABLE_WITH_CONFIRMATION, UNAVAILABLE, or ERROR.
 *
 * HONESTY PRINCIPLE: Capability status is derived from real session state.
 * Nothing is classified as AVAILABLE unless the session metadata confirms it.
 * No network calls to provider endpoints are made here — that is the health probe's job.
 */

import type { FounderComputerCapabilityEntry, FounderComputerCapabilityStatus } from "../types.ts";
import type { FounderComputerSession } from "./session.ts";

/**
 * Canonical set of services and capabilities discoverable through the Founder Computer.
 * accessMethod reflects HOW the capability is exercised — browser, desktop, or API.
 * requiresDomains lists authenticated domain requirements.
 */
const CAPABILITY_CATALOGUE: Array<{
  service: string;
  capability: string;
  accessMethod: "api" | "browser" | "desktop" | "manual_confirmation";
  requiresDomains?: string[];
  note?: string;
}> = [
  // === Google services via browser ===
  {
    service: "Google Gemini",
    capability: "gemini.chat",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Requires Google account authenticated in browser profile.",
  },
  {
    service: "Google AI Studio",
    capability: "aistudio.prompt",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "AI Studio requires authenticated Google account.",
  },
  {
    service: "Google Drive",
    capability: "drive.browse",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Drive file browsing via authorized Google account.",
  },
  {
    service: "Google Drive",
    capability: "drive.download",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "File download requires authorized session.",
  },
  {
    service: "Google Drive",
    capability: "drive.upload",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "File upload requires authorized session.",
  },
  {
    service: "Google Cloud Console",
    capability: "cloud.console_browse",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Cloud Console requires authorized Google account.",
  },
  {
    service: "Google Flow / Veo",
    capability: "video.generate_browser",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Video generation via Flow UI. Requires Google AI Pro entitlement. Manual confirmation recommended for generations.",
  },
  // === Antigravity ===
  {
    service: "Antigravity IDE",
    capability: "antigravity.workspace",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Antigravity requires authorized Google account and desktop/browser IDE access.",
  },
  {
    service: "Antigravity IDE",
    capability: "antigravity.run_task",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Running Antigravity coding tasks. Requires AVAILABLE_WITH_CONFIRMATION — Founder reviews before execution.",
  },
  // === Jules ===
  {
    service: "Jules (Google)",
    capability: "jules.task",
    accessMethod: "browser",
    requiresDomains: ["google.com"],
    note: "Jules requires separate authorization via Google account. Status may differ from Gemini.",
  },
  // === Generic browser primitives (always available once connected) ===
  {
    service: "Browser Runtime",
    capability: "browser.navigate",
    accessMethod: "browser",
    note: "Always available once session is connected.",
  },
  {
    service: "Browser Runtime",
    capability: "browser.screenshot",
    accessMethod: "browser",
    note: "Always available once session is connected.",
  },
  {
    service: "Browser Runtime",
    capability: "browser.read",
    accessMethod: "browser",
    note: "DOM/text extraction. Always available once session is connected.",
  },
];

/**
 * Classifies all known capabilities given the current session state.
 * Returns an honest list — UNAVAILABLE when session is absent, REQUIRES_AUTH
 * when the domain is not yet authenticated.
 */
export function discoverFounderComputerCapabilities(
  session: FounderComputerSession | null
): FounderComputerCapabilityEntry[] {
  if (!session || session.status === "not_configured" || session.status === "disconnected") {
    // All unavailable — session doesn't exist
    return CAPABILITY_CATALOGUE.map((c) => ({
      service: c.service,
      capability: c.capability,
      status: "unavailable" satisfies FounderComputerCapabilityStatus,
      accessMethod: c.accessMethod,
      note: "Founder Computer not connected. Click Connect to set up the session.",
    }));
  }

  const isAuth = session.sessionStatus === "AUTHENTICATED" || session.status === "ready";

  if (!isAuth && (session.status === "auth_required" || session.status === "expired" || session.sessionStatus === "AUTH_REQUIRED")) {
    return CAPABILITY_CATALOGUE.map((c) => ({
      service: c.service,
      capability: c.capability,
      status: "requires_auth" satisfies FounderComputerCapabilityStatus,
      accessMethod: c.accessMethod,
      note: "Session requires authentication. Open Browser Setup and sign in manually.",
    }));
  }

  const authenticatedDomains = session.authenticatedDomains.map((d) => d.toLowerCase());

  return CAPABILITY_CATALOGUE.map((c): FounderComputerCapabilityEntry => {
    // Browser runtime primitives are always available when session is connected
    if (!c.requiresDomains || c.requiresDomains.length === 0) {
      return {
        service: c.service,
        capability: c.capability,
        status: "available",
        accessMethod: c.accessMethod,
        note: c.note,
      };
    }

    // Check if the required domains are authenticated
    const domainsMatched = c.requiresDomains.every((req) =>
      authenticatedDomains.some((auth) => auth.includes(req.toLowerCase()))
    );

    if (!domainsMatched) {
      return {
        service: c.service,
        capability: c.capability,
        status: "requires_auth",
        accessMethod: c.accessMethod,
        note: `Requires authenticated session for: ${c.requiresDomains.join(", ")}`,
      };
    }

    // Special: Antigravity run_task and video generation are confirmation-gated
    if (
      c.capability === "antigravity.run_task" ||
      c.capability === "video.generate_browser"
    ) {
      return {
        service: c.service,
        capability: c.capability,
        status: "available_with_confirmation",
        accessMethod: c.accessMethod,
        note: c.note,
      };
    }

    return {
      service: c.service,
      capability: c.capability,
      status: "available",
      accessMethod: c.accessMethod,
      note: c.note,
    };
  });
}

/**
 * Returns the subset of capability keys that should be stored in
 * connector_connections.discovered_capabilities (the string-key format).
 */
export function toDiscoveredCapabilityKeys(
  entries: FounderComputerCapabilityEntry[]
): string[] {
  return entries
    .filter((e) => e.status === "available" || e.status === "available_with_confirmation")
    .map((e) => e.capability);
}
