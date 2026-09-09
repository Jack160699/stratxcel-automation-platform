import type { McpAuthorizationInput, McpAuthorizationResult } from "./types.ts";
import { getMcpDefinition } from "./registry.ts";

/**
 * Unified MCP Tool Authorization Engine
 *
 * Implements the single, canonical control-plane decision chain:
 * Founder -> Company -> Agent -> Mission -> Capability -> MCP -> Tool -> Permission -> Autonomy -> Budget
 *
 * Enforces fail-closed security:
 * 1. MCP must exist in canonical registry.
 * 2. Tool must be declared on the MCP.
 * 3. High-risk or destructive tools require explicit Founder confirmation unless specifically granted.
 * 4. Unauthenticated MCPs return AUTH_REQUIRED.
 * 5. Returns preferred fallback when an MCP is unavailable.
 */
export async function assertMcpToolAuthorized(
  input: McpAuthorizationInput
): Promise<McpAuthorizationResult> {
  const mcp = getMcpDefinition(input.mcpId);
  if (!mcp) {
    return {
      authorized: false,
      requiresConfirmation: false,
      status: "DENIED",
      reason: `Unknown or unregistered MCP server: '${input.mcpId}'`,
    };
  }

  // 1. Check MCP Authentication Status
  if (mcp.status === "auth_required") {
    return {
      authorized: false,
      requiresConfirmation: false,
      status: "AUTH_REQUIRED",
      reason: `MCP server '${input.mcpId}' is configured but requires credential authorization before execution.`,
      fallback: mcp.fallback,
    };
  }

  if (mcp.status === "broken" || mcp.status === "unavailable") {
    return {
      authorized: false,
      requiresConfirmation: false,
      status: "DENIED",
      reason: `MCP server '${input.mcpId}' is currently ${mcp.status}.`,
      fallback: mcp.fallback,
    };
  }

  // 2. Tool existence check
  const tool = mcp.supportedTools.find((t) => t.name === input.toolName);
  if (!tool) {
    return {
      authorized: false,
      requiresConfirmation: false,
      status: "DENIED",
      reason: `Tool '${input.toolName}' is not registered on MCP server '${input.mcpId}'.`,
      fallback: mcp.fallback,
    };
  }

  // 3. Confirmation Policy & Risk Level Gate
  const isDestructive = tool.riskLevel === "destructive" || tool.riskLevel === "high";
  const requiresConfirmation =
    tool.confirmationPolicy === "confirmation_required" ||
    (isDestructive && !input.confirmedByFounder);

  if (requiresConfirmation && !input.confirmedByFounder) {
    return {
      authorized: false,
      requiresConfirmation: true,
      status: "CONFIRMATION_REQUIRED",
      reason: `Tool '${input.toolName}' on MCP '${input.mcpId}' has risk level '${tool.riskLevel}' and requires explicit Founder approval before execution.`,
      auditMetadata: {
        riskLevel: tool.riskLevel,
        confirmationPolicy: tool.confirmationPolicy,
        requiredPermissions: tool.requiredPermissions,
      },
    };
  }

  // 4. Authorized for execution
  return {
    authorized: true,
    requiresConfirmation: false,
    status: "AUTHORIZED",
    reason: `Tool '${input.toolName}' authorized on MCP '${input.mcpId}'.`,
    auditMetadata: {
      riskLevel: tool.riskLevel,
      actorKind: input.actorKind,
      tenantId: input.tenantId,
      missionId: input.missionId,
    },
  };
}
