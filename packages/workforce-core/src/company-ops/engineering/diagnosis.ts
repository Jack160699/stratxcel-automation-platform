import { ALL_TOOL_NAMES, type ToolName } from "@stratxcel/hermes";
import { SecurityValidationError } from "../../security/narrowing.ts";
import type {
  EngineeringClassification,
  EngineeringDiagnosis,
  InfrastructureIncidentHandoff,
} from "../types.ts";

const HOST_TOOL_NAMES = new Set([
  "terminal",
  "shell",
  "code_execution",
  "bash",
  "exec",
  "run_command",
  "host_terminal",
]);

/**
 * Engineering must never receive host terminal/shell/code_execution via Hermes.
 * Allowed tools are exactly the restricted Stratxcel Hermes set.
 */
export function assertEngineeringNoHostTools(tools: readonly string[]): void {
  for (const tool of ALL_TOOL_NAMES) {
    if (HOST_TOOL_NAMES.has(tool)) {
      throw new SecurityValidationError(
        "host_tool_in_hermes_allowlist",
        `Hermes ALL_TOOL_NAMES must not include host tool: ${tool}`,
      );
    }
  }

  for (const tool of tools) {
    if (HOST_TOOL_NAMES.has(tool)) {
      throw new SecurityValidationError(
        "host_tool_denied",
        `Engineering cannot access host tool via Hermes: ${tool}`,
      );
    }
    if (!ALL_TOOL_NAMES.includes(tool as ToolName)) {
      throw new SecurityValidationError(
        "tool_not_in_hermes_allowlist",
        `Tool not in Hermes allowlist: ${tool}`,
      );
    }
  }
}

function classify(summary: string, signals?: { integrationKey?: string; kind?: string }): EngineeringClassification {
  if (signals?.integrationKey || /oauth|integration|instagram|facebook|whatsapp|disconnected/i.test(summary)) {
    return "integration";
  }
  if (signals?.kind === "website" || /website|landing|deploy|dns/i.test(summary)) {
    return "website";
  }
  if (signals?.kind === "infrastructure" || /worker|queue|infra|outage|latency/i.test(summary)) {
    return "infrastructure";
  }
  if (/platform|gateway|hermes|mission/i.test(summary)) {
    return "platform";
  }
  return "unknown";
}

/**
 * Technical diagnosis only — repair proposals are controlled Stratxcel service work,
 * never unrestricted host execution.
 */
export function diagnoseEngineeringIssue(input: {
  tenantId: string;
  missionId: string;
  summary: string;
  signals?: { integrationKey?: string; kind?: string };
}): EngineeringDiagnosis {
  assertEngineeringNoHostTools([]);
  const classification = classify(input.summary, input.signals);
  const repairProposal =
    classification === "integration"
      ? "Re-authorize integration via Stratxcel OAuth service; do not use host shell."
      : classification === "website"
        ? "Open website change request via Stratxcel controlled deploy path."
        : classification === "infrastructure"
          ? "Create infrastructure incident handoff for human ops — no host tools."
          : "Classify further with platform diagnostics; execution remains Stratxcel services only.";

  return {
    tenantId: input.tenantId,
    missionId: input.missionId,
    classification,
    summary: input.summary,
    repairProposal,
    hostToolAccess: "DENIED",
    executionAuthority: "STRATXCEL_SERVICES_ONLY",
    allowedHermesTools: [...ALL_TOOL_NAMES],
  };
}

export function createInfrastructureIncidentHandoff(input: {
  tenantId: string;
  missionId: string;
  summary: string;
}): InfrastructureIncidentHandoff {
  assertEngineeringNoHostTools([]);
  return {
    tenantId: input.tenantId,
    missionId: input.missionId,
    summary: input.summary,
    hostToolAccess: "DENIED",
    executionAuthority: "STRATXCEL_SERVICES_ONLY",
    handoffTarget: "human_ops_infrastructure",
  };
}

export function listAllowedEngineeringHermesTools(): readonly ToolName[] {
  return [...ALL_TOOL_NAMES];
}
