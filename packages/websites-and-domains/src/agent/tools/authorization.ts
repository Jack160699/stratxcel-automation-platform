/**
 * Tool Authorization & Permission Enforcer
 *
 * Verifies that the tool invocation matches the active session context
 * and strictly denies public agents from invoking RESTRICTED tools.
 */

import type { ToolDefinition, ToolExecutionContext } from "../types.ts";

export class ToolAuthorizer {
  /**
   * Authorizes a tool execution request.
   */
  public authorize(
    tool: ToolDefinition,
    ctx: ToolExecutionContext
  ): { authorized: boolean; reason?: string } {
    // 1. Validate mandatory server-scoped tenant and project context
    if (!ctx.tenantId || !ctx.projectId) {
      return { authorized: false, reason: "Missing server-scoped tenant or project context" };
    }

    // 2. Reject RESTRICTED tools for public website agents
    if (tool.permissionLevel === "RESTRICTED") {
      return {
        authorized: false,
        reason: `TOOL_UNAUTHORIZED: ${tool.name} is a RESTRICTED administrative tool and cannot be executed by the public website agent`,
      };
    }

    // 3. Customer session tools require session token
    if (tool.permissionLevel === "CUSTOMER_SESSION") {
      if (!ctx.sessionToken && !ctx.customerId) {
        return { authorized: false, reason: `CUSTOMER_SESSION_REQUIRED: ${tool.name} requires an active customer session` };
      }
    }

    return { authorized: true };
  }
}

export const toolAuthorizer = new ToolAuthorizer();
