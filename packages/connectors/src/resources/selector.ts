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
import { getWorkerHealth } from "@stratxcel/queue";
import { getMcpDefinition } from "../mcp/registry.ts";

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

  "image.analyze": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "image.analyze",
      method: "browser",
      providerLabel: "Google Vision AI (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "image.analyze",
      method: "api",
      providerLabel: "Google Gemini Multimodal API",
      priority: 2,
      requiresConfirmation: false,
    },
  ],

  "file.analyze": [
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "file.analyze",
      method: "api",
      providerLabel: "Google Document & Spreadsheet Analyzer",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "founder_computer",
      capabilityKey: "file.analyze",
      method: "browser",
      providerLabel: "Google Workspace / Drive Analysis",
      priority: 2,
      requiresConfirmation: false,
    },
  ],

  "link.analyze": [
    {
      connectorKey: "stratxcel-browser",
      capabilityKey: "browser.navigate",
      method: "mcp",
      providerLabel: "Playwright Browser MCP",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "founder_computer",
      capabilityKey: "browser.navigate",
      method: "browser",
      providerLabel: "Founder Computer (CDP/Chrome)",
      priority: 2,
      requiresConfirmation: false,
    },
  ],

  "google.research": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "google.research",
      method: "browser",
      providerLabel: "Google Founder Browser & Web Intelligence",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "google.research",
      method: "api",
      providerLabel: "Google Gemini Web Grounding API",
      priority: 2,
      requiresConfirmation: false,
    },
  ],

  "meta.intelligence": [
    {
      connectorKey: "meta",
      capabilityKey: "meta.intelligence",
      method: "api",
      providerLabel: "Meta Developer & Graph API",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "agent.create": [
    {
      connectorKey: "aws",
      capabilityKey: "agent.create",
      method: "cli",
      providerLabel: "StratXcel Agent Factory Control Plane",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "agent.deploy": [
    {
      connectorKey: "aws",
      capabilityKey: "agent.deploy",
      method: "cli",
      providerLabel: "AWS Cloud Persistent Worker",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "agent.health": [
    {
      connectorKey: "aws",
      capabilityKey: "agent.health",
      method: "cli",
      providerLabel: "AWS Cloud Worker Diagnostics",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "antigravity.code": [
    {
      connectorKey: "antigravity_worker",
      capabilityKey: "antigravity.code",
      method: "native",
      providerLabel: "Local Antigravity Worker (Founder PC)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "founder_computer",
      capabilityKey: "antigravity.code",
      method: "browser",
      providerLabel: "Antigravity IDE (Founder Browser)",
      priority: 2,
      requiresConfirmation: false,
    },
    {
      connectorKey: "founder_computer",
      capabilityKey: "antigravity.run_task",
      method: "desktop",
      providerLabel: "Antigravity Desktop Agent",
      priority: 3,
      requiresConfirmation: true,
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "antigravity.code",
      method: "api",
      providerLabel: "Google AI Pro Code API",
      priority: 4,
      requiresConfirmation: false,
    },
  ],

  "antigravity.run_task": [
    {
      connectorKey: "antigravity_worker",
      capabilityKey: "antigravity.run_task",
      method: "native",
      providerLabel: "Local Antigravity Worker (Founder PC)",
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
      requiresConfirmation: true, // Drive upload writes to Founder storage -> requires confirmation
    },
    {
      connectorKey: "google_ai_pro",
      capabilityKey: "google_drive.upload",
      method: "api",
      providerLabel: "Google AI Pro Drive API",
      priority: 2,
      requiresConfirmation: true,
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

  "drive.download": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "drive.download",
      method: "browser",
      providerLabel: "Google Drive (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "aistudio.prompt": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "aistudio.prompt",
      method: "browser",
      providerLabel: "Google AI Studio (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "cloud.console_browse": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "cloud.console_browse",
      method: "browser",
      providerLabel: "Google Cloud Console (Founder Browser)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "colab.notebook": [
    {
      connectorKey: "founder_computer",
      capabilityKey: "colab.notebook",
      method: "browser",
      providerLabel: "Google Colab (Founder Browser)",
      priority: 1,
      requiresConfirmation: true, // Colab workload execution requires confirmation
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

  "infrastructure.inspect": [
    {
      connectorKey: "aws",
      capabilityKey: "infrastructure.inspect",
      method: "cli",
      providerLabel: "AWS Cloud Infrastructure (ap-south-1)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "infrastructure.ec2": [
    {
      connectorKey: "aws",
      capabilityKey: "infrastructure.ec2",
      method: "cli",
      providerLabel: "AWS EC2 Instance (ap-south-1)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "infrastructure.ssm": [
    {
      connectorKey: "aws",
      capabilityKey: "infrastructure.ssm",
      method: "cli",
      providerLabel: "AWS Systems Manager (ap-south-1)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "infrastructure.deploy_verify": [
    {
      connectorKey: "aws",
      capabilityKey: "infrastructure.deploy_verify",
      method: "cli",
      providerLabel: "AWS Deployment Verification (ap-south-1)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "infrastructure.logs": [
    {
      connectorKey: "aws",
      capabilityKey: "infrastructure.logs",
      method: "cli",
      providerLabel: "AWS Infrastructure Logs (ap-south-1)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "infrastructure.repo_read": [
    {
      connectorKey: "stratxcel-github",
      capabilityKey: "infrastructure.repo_read",
      method: "mcp",
      providerLabel: "GitHub MCP Server (stratxcel-github)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "github",
      capabilityKey: "infrastructure.repo_read",
      method: "api",
      providerLabel: "GitHub Repository API",
      priority: 2,
      requiresConfirmation: false,
    },
  ],

  "infrastructure.repo_write": [
    {
      connectorKey: "stratxcel-github",
      capabilityKey: "infrastructure.repo_write",
      method: "mcp",
      providerLabel: "GitHub MCP Server (stratxcel-github)",
      priority: 1,
      requiresConfirmation: true,
    },
    {
      connectorKey: "github",
      capabilityKey: "infrastructure.repo_write",
      method: "api",
      providerLabel: "GitHub Repository API",
      priority: 2,
      requiresConfirmation: true,
    },
  ],

  "infrastructure.ci_inspect": [
    {
      connectorKey: "github",
      capabilityKey: "infrastructure.ci_inspect",
      method: "api",
      providerLabel: "GitHub Actions & Workflows API",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "github.pr_read": [
    {
      connectorKey: "github",
      capabilityKey: "github.pr_read",
      method: "api",
      providerLabel: "GitHub Pull Requests API",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "github.issue_read": [
    {
      connectorKey: "github",
      capabilityKey: "github.issue_read",
      method: "api",
      providerLabel: "GitHub Issues API",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "github.file_read": [
    {
      connectorKey: "github",
      capabilityKey: "github.file_read",
      method: "api",
      providerLabel: "GitHub Contents API",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "meta.page_read": [
    {
      connectorKey: "meta",
      capabilityKey: "meta.page_read",
      method: "api",
      providerLabel: "Meta Graph API (Facebook Page)",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "meta.instagram_read": [
    {
      connectorKey: "meta",
      capabilityKey: "meta.instagram_read",
      method: "api",
      providerLabel: "Instagram Graph API",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "social.read": [
    {
      connectorKey: "meta",
      capabilityKey: "social.read",
      method: "api",
      providerLabel: "Meta Social Graph Read",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "social.insights": [
    {
      connectorKey: "meta",
      capabilityKey: "social.insights",
      method: "api",
      providerLabel: "Meta Graph API Insights",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "social.analytics": [
    {
      connectorKey: "meta",
      capabilityKey: "social.analytics",
      method: "api",
      providerLabel: "Meta Social Analytics",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "social.post": [
    {
      connectorKey: "meta",
      capabilityKey: "social.post",
      method: "api",
      providerLabel: "Meta Social Autopilot Publishing",
      priority: 1,
      requiresConfirmation: true,
    },
  ],

  "messaging.send": [
    {
      connectorKey: "meta",
      capabilityKey: "messaging.send",
      method: "api",
      providerLabel: "Meta Business Cloud Messaging",
      priority: 1,
      requiresConfirmation: true,
    },
  ],

  "messaging.receive": [
    {
      connectorKey: "meta",
      capabilityKey: "messaging.receive",
      method: "api",
      providerLabel: "Meta Webhook Ingestion",
      priority: 1,
      requiresConfirmation: false,
    },
  ],

  "browser.navigate": [
    {
      connectorKey: "stratxcel-browser",
      capabilityKey: "browser.navigate",
      method: "mcp",
      providerLabel: "Playwright Browser MCP (stratxcel-browser)",
      priority: 1,
      requiresConfirmation: false,
    },
    {
      connectorKey: "founder_computer",
      capabilityKey: "browser.navigate",
      method: "browser",
      providerLabel: "Founder Computer (CDP/Browser)",
      priority: 2,
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
      if (cand.connectorKey === "antigravity_worker") {
        let workerHealthReport;
        try {
          workerHealthReport = await getWorkerHealth(supabase, "antigravity-worker");
        } catch {
          workerHealthReport = {
            status: "unavailable" as const,
            workerType: "antigravity-worker" as const,
            instances: [],
            reason: "Could not query worker health",
          };
        }

        if (workerHealthReport.status === "healthy") {
          chosenCandidate = cand;
          chosenStatus = "AVAILABLE";
          chosenReason = "Local Antigravity Worker is online, responsive, and available.";
          break;
        } else {
          evaluatedFallbacks.push({
            connectorKey: cand.connectorKey,
            capabilityKey: cand.capabilityKey,
            method: cand.method,
            provider: cand.providerLabel,
            status: workerHealthReport.status === "degraded" ? "DEGRADED" : "UNAVAILABLE",
            reason: workerHealthReport.reason ?? "Antigravity Worker is offline or heartbeat is stale",
          });
          continue;
        }
      }

      if (cand.method === "mcp") {
        const mcpDef = getMcpDefinition(cand.connectorKey);
        if (!mcpDef) {
          evaluatedFallbacks.push({
            connectorKey: cand.connectorKey,
            capabilityKey: cand.capabilityKey,
            method: cand.method,
            provider: cand.providerLabel,
            status: "UNAVAILABLE",
            reason: `MCP server "${cand.connectorKey}" is not registered in canonical MCP registry`,
          });
          continue;
        }

        if (mcpDef.status === "auth_required") {
          evaluatedFallbacks.push({
            connectorKey: cand.connectorKey,
            capabilityKey: cand.capabilityKey,
            method: cand.method,
            provider: cand.providerLabel,
            status: "AUTH_REQUIRED",
            reason: `MCP server "${cand.connectorKey}" requires authentication before execution`,
          });
          continue;
        }

        if (mcpDef.status === "healthy" || mcpDef.status === "authorized" || mcpDef.status === "configured") {
          const reqConfirm = cand.requiresConfirmation ?? (mcpDef.confirmationPolicy !== "autonomous");
          if (requireAutonomous && reqConfirm) {
            evaluatedFallbacks.push({
              connectorKey: cand.connectorKey,
              capabilityKey: cand.capabilityKey,
              method: cand.method,
              provider: cand.providerLabel,
              status: "AVAILABLE_WITH_CONFIRMATION",
              reason: "requires_confirmation: MCP action requires confirmation; strict autonomy requested",
            });
            continue;
          }

          chosenCandidate = cand;
          chosenStatus = reqConfirm ? "AVAILABLE_WITH_CONFIRMATION" : "AVAILABLE";
          chosenReason = `Selected ${mcpDef.serverName} (${cand.method} - ${mcpDef.transport}) — healthy and available`;
          break;
        }

        evaluatedFallbacks.push({
          connectorKey: cand.connectorKey,
          capabilityKey: cand.capabilityKey,
          method: cand.method,
          provider: cand.providerLabel,
          status: mcpDef.status === "degraded" ? "DEGRADED" : "UNAVAILABLE",
          reason: `MCP server status is ${mcpDef.status}`,
        });
        continue;
      }

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
