/**
 * Hermes Dynamic Resource Selector & Capability Router
 *
 * Inspects all available resources (Founder Browser, Google AI Pro, Gemini API,
 * OpenRouter, local tools) and selects the best legitimate resource according to:
 * - Capability support & genuine readiness
 * - Availability & health status
 * - Method preference (Founder Browser vs API vs Desktop)
 * - Autonomy & confirmation policies (high-cost/destructive actions require confirmation)
 * - Budget, rate limits, and company/tenant permissions
 * - Clean fallback hierarchy when preferred resource is unavailable or locked
 */

import type { ServiceClient } from "../db.ts";
import type { ConnectorAccessMethod, ConnectorHealthStatus } from "../types.ts";
import { getConnectorConnection } from "../repository.ts";
import { parseFounderComputerSession } from "../founder-computer/session.ts";
import { getConnectorDefinition } from "../registry.ts";

export type ResourceCapabilityStatus =
  | "AVAILABLE"
  | "AVAILABLE_WITH_CONFIRMATION"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE"
  | "DEGRADED"
  | "ERROR"
  | "UNKNOWN";

export interface CandidateResource {
  connectorKey: string;
  capabilityKey: string;
  method: ConnectorAccessMethod;
  providerLabel: string;
  priority: number; // lower number = higher priority
  requiresConfirmation?: boolean;
  estimatedCostUsd?: number;
}

export interface ResourceSelectionResult {
  requestedCapability: string;
  selectedConnector: string;
  selectedCapabilityKey: string;
  executionMethod: ConnectorAccessMethod;
  provider: string;
  status: ResourceCapabilityStatus;
  requiresConfirmation: boolean;
  reason: string;
  fallbackAvailable: boolean;
  fallbackUsed: boolean;
  selected: {
    connectorKey: string;
    capabilityKey: string;
    executionMethod: ConnectorAccessMethod;
    provider: string;
    status: ResourceCapabilityStatus;
    requiresConfirmation: boolean;
  } | null;
  alternatives: Array<{
    connectorKey: string;
    capabilityKey: string;
    method: ConnectorAccessMethod;
    provider: string;
    status: ResourceCapabilityStatus;
    reason: string;
    statusReason?: string;
  }>;
  fallbacks: Array<{
    connectorKey: string;
    capabilityKey: string;
    method: ConnectorAccessMethod;
    provider: string;
    status: ResourceCapabilityStatus;
    reason: string;
  }>;
  evaluatedAt: string;
}

/**
 * Canonical fallback hierarchy for capabilities requested by Hermes.
 */
export const CAPABILITY_CANDIDATE_MATRIX: Record<string, CandidateResource[]> = {
  "image.generate": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "image.generate",
      method: "browser",
      providerLabel: "Founder Browser (Google)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "image.generate",
      method: "api",
      providerLabel: "Google AI Pro (OAuth API)",
      priority: 2,
      requiresConfirmation: false,
    },
    {
      connectorKey: "gemini",
      capabilityKey: "media.image_generation",
      method: "api",
      providerLabel: "Gemini Platform API",
      priority: 3,
      requiresConfirmation: false,
    },
    {
      connectorKey: "openrouter",
      capabilityKey: "image.generate",
      method: "api",
      providerLabel: "OpenRouter Gateway",
      priority: 4,
      requiresConfirmation: false,
    },
  ],

  "video.generate": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "video.generate",
      method: "browser",
      providerLabel: "Founder Browser (Google Flow/Veo)",
      priority: 1,
      requiresConfirmation: true, // Video generation is quota-intensive -> requires confirmation
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "video.generate",
      method: "api",
      providerLabel: "Google AI Pro Video",
      priority: 2,
      requiresConfirmation: true,
    },
  ],

  "antigravity.code": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "antigravity.code",
      method: "browser",
      providerLabel: "Antigravity IDE (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "founder_computer",
      capabilityKey: "antigravity.run_task",
      method: "desktop",
      providerLabel: "Antigravity Desktop Agent",
      priority: 2,
      requiresConfirmation: true,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "antigravity.code",
      method: "api",
      providerLabel: "Google AI Pro Code API",
      priority: 3,
      requiresConfirmation: false,
    },
  ],

  "jules.task": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "jules.task",
      method: "browser",
      providerLabel: "Google Jules (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "drive.upload": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "drive.upload",
      method: "browser",
      providerLabel: "Google Drive (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "google_drive.upload",
      method: "api",
      providerLabel: "Google AI Pro Drive API",
      priority: 2,
      requiresConfirmation: false,
    },
  ],

  "drive.browse": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "drive.browse",
      method: "browser",
      providerLabel: "Google Drive (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "gemini.chat": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "gemini.chat",
      method: "browser",
      providerLabel: "Google Gemini (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "google_ai_pro.reasoning",
      method: "api",
      providerLabel: "Google AI Pro Reasoning",
      priority: 2,
      requiresConfirmation: false,
    },
    {
      connectorKey: "gemini",
      capabilityKey: "ai.generate_text",
      method: "api",
      providerLabel: "Gemini Platform API",
      priority: 3,
      requiresConfirmation: false,
    },
  ],
};

/**
 * Evaluates candidate resources for a capability and selects the best legitimate option.
 */
export async function selectBestResource(
  supabase: ServiceClient,
  opts: {
    capabilityKey: string;
    tenantId?: string | null;
    missionId?: string | null;
    requireAutonomous?: boolean;
  }
): Promise<ResourceSelectionResult> {
  const { capabilityKey, tenantId = null, requireAutonomous = false } = opts;
  const candidates = CAPABILITY_CANDIDATE_MATRIX[capabilityKey] ?? [
    {
      connectorKey: "founder_computer",
      capabilityKey,
      method: "browser" as ConnectorAccessMethod,
      providerLabel: "Founder Computer",
      priority: 1,
    },
  ];

  const evaluatedFallbacks: Array<{
    connectorKey: string;
    capabilityKey: string;
    method: ConnectorAccessMethod;
    provider: string;
    status: ResourceCapabilityStatus;
    reason: string;
  }> = [];

  let chosenCandidate: CandidateResource | null = null;
  let chosenStatus: ResourceCapabilityStatus = "UNAVAILABLE";
  let chosenReason = "No candidate resources met availability requirements.";

  for (const cand of candidates) {
    try {
      const conn = await getConnectorConnection(supabase, cand.connectorKey, tenantId);

      if (!conn) {
        evaluatedFallbacks.push({
          connectorKey: cand.connectorKey,
          capabilityKey: cand.capabilityKey,
          method: cand.method,
          provider: cand.providerLabel,
          status: "UNAVAILABLE",
          reason: "Connector connection record does not exist",
        });
        continue;
      }

      // Check connector health
      const status = (conn.status as string)?.toLowerCase() as ConnectorHealthStatus | "healthy" | "ready";
      const isHealthy = ["connected", "healthy", "ready"].includes(status);

      if (!isHealthy) {
        const fallbackStatus: ResourceCapabilityStatus =
          status === "auth_required"
            ? "AUTH_REQUIRED"
            : status === "requires_reauth" || status === "auth_expired"
            ? "AUTH_REQUIRED"
            : status === "degraded"
            ? "DEGRADED"
            : "UNAVAILABLE";

        evaluatedFallbacks.push({
          connectorKey: cand.connectorKey,
          capabilityKey: cand.capabilityKey,
          method: cand.method,
          provider: cand.providerLabel,
          status: fallbackStatus,
          reason: `Connector status is ${status}`,
        });
        continue;
      }

      // Check budget / quota
      if (
        typeof conn.budget_limit_usd === "number" &&
        conn.budget_limit_usd > 0 &&
        typeof conn.current_usage_usd === "number" &&
        conn.current_usage_usd >= conn.budget_limit_usd
      ) {
        evaluatedFallbacks.push({
          connectorKey: cand.connectorKey,
          capabilityKey: cand.capabilityKey,
          method: cand.method,
          provider: cand.providerLabel,
          status: "DEGRADED",
          reason: `Usage limit exceeded ($${conn.current_usage_usd} >= $${conn.budget_limit_usd})`,
        });
        continue;
      }

      // If Founder Computer: check session & Founder Control Lock
      if (cand.connectorKey === "founder_computer") {
        let meta = conn.metadata as Record<string, unknown> | null;
        if (!meta && typeof conn.encrypted_secret_ref === "string" && conn.encrypted_secret_ref.startsWith("fc-meta:")) {
          try {
            meta = JSON.parse(conn.encrypted_secret_ref.slice(8));
          } catch {}
        }
        const session = parseFounderComputerSession(meta);

        // Check authentication state
        const isGoogleAuthed =
          Boolean(session?.authenticatedGoogleAccount) ||
          (session?.authenticatedDomains ?? []).some((d) => d.toLowerCase().includes("google.com"));

        if (!isGoogleAuthed) {
          evaluatedFallbacks.push({
            connectorKey: cand.connectorKey,
            capabilityKey: cand.capabilityKey,
            method: cand.method,
            provider: cand.providerLabel,
            status: "AUTH_REQUIRED",
            reason: "Session requires authentication: Google session not authenticated",
          });
          continue;
        }

        if (session?.controlLock === "FOUNDER_CONTROL") {
          evaluatedFallbacks.push({
            connectorKey: cand.connectorKey,
            capabilityKey: cand.capabilityKey,
            method: cand.method,
            provider: cand.providerLabel,
            status: "DEGRADED",
            reason: "founder_control_active: Founder is currently interacting with the browser",
          });
          continue;
        }

        // Check discovered capabilities
        const discovered = (conn.discovered_capabilities as string[]) ?? [];
        const hasCapability =
          discovered.includes(cand.capabilityKey) ||
          discovered.includes("browser.navigate") ||
          cand.capabilityKey.startsWith("browser.");

        if (!hasCapability) {
          evaluatedFallbacks.push({
            connectorKey: cand.connectorKey,
            capabilityKey: cand.capabilityKey,
            method: cand.method,
            provider: cand.providerLabel,
            status: "UNAVAILABLE",
            reason: `Capability ${cand.capabilityKey} not present in discovered capabilities`,
          });
          continue;
        }
      }

      // Check confirmation requirement against autonomy preference
      const requiresConfirmation = Boolean(cand.requiresConfirmation);
      if (requireAutonomous && requiresConfirmation) {
        evaluatedFallbacks.push({
          connectorKey: cand.connectorKey,
          capabilityKey: cand.capabilityKey,
          method: cand.method,
          provider: cand.providerLabel,
          status: "AVAILABLE_WITH_CONFIRMATION",
          reason: "requires_confirmation: Candidate requires human confirmation; strict autonomy was requested",
        });
        continue;
      }

      // Candidate is viable!
      chosenCandidate = cand;
      chosenStatus = requiresConfirmation ? "AVAILABLE_WITH_CONFIRMATION" : "AVAILABLE";
      chosenReason = `Selected ${cand.providerLabel} (${cand.method}) — healthy and available`;
      break;
    } catch (err) {
      evaluatedFallbacks.push({
        connectorKey: cand.connectorKey,
        capabilityKey: cand.capabilityKey,
        method: cand.method,
        provider: cand.providerLabel,
        status: "ERROR",
        reason: err instanceof Error ? err.message : "Unknown evaluation error",
      });
    }
  }

  const fallbackUsed = Boolean(chosenCandidate && candidates.length > 0 && candidates[0].connectorKey !== chosenCandidate.connectorKey);

  // If no candidate was viable, fall back to the first defined candidate or an error state
  if (!chosenCandidate) {
    const defaultCand = candidates[0];
    return {
      requestedCapability: capabilityKey,
      selectedConnector: defaultCand?.connectorKey ?? "unknown",
      selectedCapabilityKey: defaultCand?.capabilityKey ?? capabilityKey,
      executionMethod: defaultCand?.method ?? "api",
      provider: defaultCand?.providerLabel ?? "Unknown Provider",
      status: "UNAVAILABLE",
      requiresConfirmation: true,
      reason: chosenReason,
      fallbackAvailable: evaluatedFallbacks.some((f) => f.status === "AVAILABLE" || f.status === "AVAILABLE_WITH_CONFIRMATION"),
      fallbackUsed: false,
      selected: null,
      alternatives: evaluatedFallbacks.map((f) => ({ ...f, statusReason: f.reason })),
      fallbacks: evaluatedFallbacks,
      evaluatedAt: new Date().toISOString(),
    };
  }

  return {
    requestedCapability: capabilityKey,
    selectedConnector: chosenCandidate.connectorKey,
    selectedCapabilityKey: chosenCandidate.capabilityKey,
    executionMethod: chosenCandidate.method,
    provider: chosenCandidate.providerLabel,
    status: chosenStatus,
    requiresConfirmation: Boolean(chosenCandidate.requiresConfirmation),
    reason: chosenReason,
    fallbackAvailable: evaluatedFallbacks.some((f) => f.status === "AVAILABLE" || f.status === "AVAILABLE_WITH_CONFIRMATION"),
    fallbackUsed,
    selected: {
      connectorKey: chosenCandidate.connectorKey,
      capabilityKey: chosenCandidate.capabilityKey,
      executionMethod: chosenCandidate.method,
      provider: chosenCandidate.providerLabel,
      status: chosenStatus,
      requiresConfirmation: Boolean(chosenCandidate.requiresConfirmation),
    },
    alternatives: evaluatedFallbacks.map((f) => ({ ...f, statusReason: f.reason })),
    fallbacks: evaluatedFallbacks,
    evaluatedAt: new Date().toISOString(),
  };
}
