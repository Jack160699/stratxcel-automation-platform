/**
 * Founder Computer — Live Google Capability Probe
 *
 * Navigates the authenticated Founder Browser to each Google service URL
 * and classifies capability status from real DOM state.
 *
 * HONESTY PRINCIPLE:
 * - Only AVAILABLE when page loads with authenticated app-level content
 * - REQUIRES_AUTH when sign-in forms or accounts.google.com/signin redirect detected
 * - UNAVAILABLE when page is unreachable or HTTP error
 * - UNKNOWN when DOM evidence is ambiguous
 *
 * SAFETY INVARIANTS:
 * - Never submits a form
 * - Never clicks a generate/submit button
 * - Never reads passwords, cookies, or tokens
 * - Read-only DOM inspection only
 */

import { executeBrowserAction, getFounderComputerRuntimeStatus } from "./runtime.ts";

export type CapabilityProbeStatus =
  | "AVAILABLE"
  | "AVAILABLE_WITH_CONFIRMATION"
  | "REQUIRES_AUTH"
  | "UNAVAILABLE"
  | "UNKNOWN";

export interface CapabilityProbeResult {
  capabilityKey: string;
  service: string;
  status: CapabilityProbeStatus;
  reason: string;
  probeUrl: string;
  pageTitle?: string;
  detectedAt: string;
  /** True when we actually navigated the browser; false when we returned early */
  liveProbe: boolean;
}

/**
 * Maps each capability key to the canonical probe URL and human-readable service name.
 * URLs are chosen to reach the authenticated session directly — no login or generation URLs.
 */
const CAPABILITY_PROBE_MAP: Record<
  string,
  { service: string; url: string; requiresConfirmation?: boolean }
> = {
  "gemini.chat": {
    service: "Google Gemini",
    url: "https://gemini.google.com/app",
  },
  "aistudio.prompt": {
    service: "Google AI Studio",
    url: "https://aistudio.google.com/",
  },
  "image.generate": {
    service: "Google AI Pro (Image via Gemini)",
    url: "https://gemini.google.com/app",
  },
  "video.generate": {
    service: "Google Flow / Veo",
    url: "https://labs.google/fx/tools/video-fx",
    requiresConfirmation: true,
  },
  "video.generate_browser": {
    service: "Google Flow / Veo (Browser)",
    url: "https://labs.google/fx/tools/video-fx",
    requiresConfirmation: true,
  },
  "antigravity.workspace": {
    service: "Antigravity IDE",
    url: "https://idx.google.com/",
  },
  "antigravity.code": {
    service: "Antigravity IDE (Code)",
    url: "https://idx.google.com/",
  },
  "antigravity.run_task": {
    service: "Antigravity IDE (Run Task)",
    url: "https://idx.google.com/",
    requiresConfirmation: true,
  },
  "jules.task": {
    service: "Google Jules",
    url: "https://jules.google.com/",
  },
  "drive.browse": {
    service: "Google Drive (Browse)",
    url: "https://drive.google.com/",
  },
  "drive.download": {
    service: "Google Drive (Download)",
    url: "https://drive.google.com/",
  },
  "drive.upload": {
    service: "Google Drive (Upload)",
    url: "https://drive.google.com/",
  },
  "cloud.console_browse": {
    service: "Google Cloud Console",
    url: "https://console.cloud.google.com/",
  },
  "colab.notebook": {
    service: "Google Colab",
    url: "https://colab.research.google.com/",
  },
  "browser.navigate": {
    service: "Browser Runtime",
    url: "about:blank",
  },
  "browser.screenshot": {
    service: "Browser Runtime",
    url: "about:blank",
  },
  "browser.read": {
    service: "Browser Runtime",
    url: "about:blank",
  },
};

/**
 * Auth-required signals detected in page title or body text.
 * If any of these appear, the session is not authenticated for this service.
 */
const AUTH_REQUIRED_SIGNALS = [
  "sign in",
  "sign in to",
  "log in",
  "log in to",
  "create account",
  "accounts.google.com/signin",
  "you need to sign in",
  "please sign in",
  "sign in with google",
  "to continue, google",
  "before you continue",
  "choose an account",
];

/**
 * Authenticated-session signals — presence of these indicates an active Google account.
 */
const AUTHENTICATED_SIGNALS = [
  "gemini",
  "my drive",
  "google drive",
  "ai studio",
  "project idx",
  "antigravity",
  "jules",
  "cloud console",
  "colab",
  "labs.google",
  "welcome",
  "new chat",
  "start a new",
  "untitled notebook",
  "your projects",
];

/**
 * Unavailable signals — page doesn't exist or service is down.
 */
const UNAVAILABLE_SIGNALS = [
  "404",
  "not found",
  "page not found",
  "error 404",
  "this page isn't available",
  "could not be reached",
  "err_connection_refused",
  "err_name_not_resolved",
];

/**
 * Classifies a page based on its title and body text.
 */
function classifyPageContent(
  title: string,
  body: string,
  capabilityKey: string,
  probeUrl: string,
  requiresConfirmation: boolean
): { status: CapabilityProbeStatus; reason: string } {
  const combined = `${title} ${body}`.toLowerCase();

  // Browser runtime primitives — always available when session is connected
  if (capabilityKey.startsWith("browser.")) {
    return { status: "AVAILABLE", reason: "Browser runtime primitive — always available when connected" };
  }

  // Check for unavailable page
  const unavailableMatch = UNAVAILABLE_SIGNALS.find((s) => combined.includes(s.toLowerCase()));
  if (unavailableMatch) {
    return {
      status: "UNAVAILABLE",
      reason: `Service page unavailable: detected "${unavailableMatch}" in page content`,
    };
  }

  // Check for auth-required signals
  const authRequiredMatch = AUTH_REQUIRED_SIGNALS.find((s) => combined.includes(s.toLowerCase()));
  if (authRequiredMatch) {
    return {
      status: "REQUIRES_AUTH",
      reason: `Session authentication required: detected "${authRequiredMatch}" in page content`,
    };
  }

  // Check for authenticated presence
  const authenticatedMatch = AUTHENTICATED_SIGNALS.find((s) => combined.includes(s.toLowerCase()));
  if (authenticatedMatch) {
    if (requiresConfirmation) {
      return {
        status: "AVAILABLE_WITH_CONFIRMATION",
        reason: `Authenticated session confirmed (detected "${authenticatedMatch}") — capability requires confirmation before execution`,
      };
    }
    return {
      status: "AVAILABLE",
      reason: `Authenticated session confirmed: detected "${authenticatedMatch}" in page content`,
    };
  }

  // Ambiguous — page loaded but evidence is unclear
  return {
    status: "UNKNOWN",
    reason: `Page loaded (${probeUrl}) but authentication state could not be definitively confirmed from DOM content`,
  };
}

/**
 * Probes a single Google capability by navigating the Founder Browser to the
 * capability's canonical URL, reading the page, and classifying auth state.
 *
 * SAFETY: Read-only probe. Never submits forms, never clicks buttons.
 */
export async function probeGoogleCapability(
  capabilityKey: string,
  opts?: { timeoutMs?: number }
): Promise<CapabilityProbeResult> {
  const now = new Date().toISOString();
  const mapping = CAPABILITY_PROBE_MAP[capabilityKey];

  if (!mapping) {
    return {
      capabilityKey,
      service: capabilityKey,
      status: "UNKNOWN",
      reason: "No probe URL mapping defined for this capability",
      probeUrl: "",
      detectedAt: now,
      liveProbe: false,
    };
  }

  const { service, url, requiresConfirmation = false } = mapping;

  // Browser runtime primitives — no navigation needed
  if (capabilityKey.startsWith("browser.")) {
    return {
      capabilityKey,
      service,
      status: "AVAILABLE",
      reason: "Browser runtime primitive — always available when Founder Browser is connected",
      probeUrl: url,
      pageTitle: undefined,
      detectedAt: now,
      liveProbe: false,
    };
  }

  // Check if runtime is active before attempting navigation
  const runtimeStatus = await getFounderComputerRuntimeStatus();
  if (runtimeStatus.state !== "RUNNING") {
    return {
      capabilityKey,
      service,
      status: "UNAVAILABLE",
      reason: `Founder Browser runtime is not running (state: ${runtimeStatus.state}) — cannot probe`,
      probeUrl: url,
      detectedAt: now,
      liveProbe: false,
    };
  }

  try {
    // Navigate to service URL — read-only, just loading the page
    const navResult = await executeBrowserAction("browser.navigate", {
      url,
      waitUntil: "domcontentloaded",
      timeoutMs: opts?.timeoutMs ?? 15000,
    });

    const currentUrl = String(navResult.url ?? url);
    const title = String(navResult.title ?? "");

    // If navigation ended up at accounts.google.com/signin, definitely requires auth
    if (
      currentUrl.includes("accounts.google.com/signin") ||
      currentUrl.includes("accounts.google.com/v3/signin")
    ) {
      return {
        capabilityKey,
        service,
        status: "REQUIRES_AUTH",
        reason: "Navigation redirected to Google sign-in page — session not authenticated for this service",
        probeUrl: currentUrl,
        pageTitle: title,
        detectedAt: new Date().toISOString(),
        liveProbe: true,
      };
    }

    // Read a slice of the page body (read-only, no interaction)
    const readResult = await executeBrowserAction("browser.read", {
      maxChars: 3000,
      mode: "text",
    });

    const bodyText = String(readResult.text ?? "");
    const classification = classifyPageContent(title, bodyText, capabilityKey, currentUrl, requiresConfirmation);

    return {
      capabilityKey,
      service,
      status: classification.status,
      reason: classification.reason,
      probeUrl: currentUrl,
      pageTitle: title,
      detectedAt: new Date().toISOString(),
      liveProbe: true,
    };
  } catch (err) {
    return {
      capabilityKey,
      service,
      status: "UNAVAILABLE",
      reason: `Browser probe failed: ${err instanceof Error ? err.message : String(err)}`,
      probeUrl: url,
      detectedAt: new Date().toISOString(),
      liveProbe: true,
    };
  }
}

/**
 * Probes all Google capabilities in sequence.
 *
 * @param opts.capabilityKeys - Optional filter. Defaults to all known Google capabilities.
 * @param opts.timeoutMs - Per-probe navigation timeout.
 * @param opts.includeRuntimePrimitives - Whether to include browser.* primitives (default: true).
 */
export async function probeGoogleCapabilities(opts?: {
  capabilityKeys?: string[];
  timeoutMs?: number;
  includeRuntimePrimitives?: boolean;
}): Promise<{
  results: CapabilityProbeResult[];
  summary: {
    total: number;
    available: number;
    availableWithConfirmation: number;
    requiresAuth: number;
    unavailable: number;
    unknown: number;
  };
  runtimeState: string;
  probedAt: string;
}> {
  const runtimeStatus = await getFounderComputerRuntimeStatus();
  const includePrimitives = opts?.includeRuntimePrimitives ?? true;

  const keysToProbe = opts?.capabilityKeys ?? Object.keys(CAPABILITY_PROBE_MAP).filter(
    (k) => includePrimitives || !k.startsWith("browser.")
  );

  const results: CapabilityProbeResult[] = [];

  for (const key of keysToProbe) {
    const result = await probeGoogleCapability(key, { timeoutMs: opts?.timeoutMs });
    results.push(result);
  }

  const summary = {
    total: results.length,
    available: results.filter((r) => r.status === "AVAILABLE").length,
    availableWithConfirmation: results.filter((r) => r.status === "AVAILABLE_WITH_CONFIRMATION").length,
    requiresAuth: results.filter((r) => r.status === "REQUIRES_AUTH").length,
    unavailable: results.filter((r) => r.status === "UNAVAILABLE").length,
    unknown: results.filter((r) => r.status === "UNKNOWN").length,
  };

  return {
    results,
    summary,
    runtimeState: runtimeStatus.state,
    probedAt: new Date().toISOString(),
  };
}

/**
 * Returns the probe URL map for external inspection.
 */
export function getCapabilityProbeMap(): typeof CAPABILITY_PROBE_MAP {
  return CAPABILITY_PROBE_MAP;
}
