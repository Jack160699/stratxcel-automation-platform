import type { ServiceClient } from "./db.ts";
import type { AgentPrincipal, AgentPrincipalResolution } from "./principal.ts";
import { consumePairingChallenge } from "./pairing/repository.ts";
import { resolveWhatsAppPrincipal, touchPrincipalLastUsed } from "./principals/repository.ts";
import { consumeActionConfirmation, cancelActionConfirmation } from "./confirmations/repository.ts";
import { resolveAgentTools } from "./tools/registry.ts";
import { resetAgentSession } from "./sessions/repository.ts";
import {
  auditPrincipalLinked,
  auditConfirmationExecuted,
  auditConfirmationCancelled,
  auditFailedAction,
} from "./audit.ts";
import { summarizeToolResult, formatAgentReply, formatWhoAmI, formatPermissionAwareHelp } from "./formatter.ts";
import type { AgentTool } from "./tools/contract.ts";
import { capabilityGroupsFromTools } from "./brain/capabilities.ts";

/**
 * Deterministic handlers for LINK / WHOAMI / RESET / NEW CHAT / CONFIRM /
 * CANCEL / HELP (PHASES 19-22). Called directly from the internal endpoint
 * BEFORE any LLM/orchestrator involvement — see command-parser.ts's header
 * comment for why that ordering is a security requirement, not just an
 * optimization.
 */

export async function handleLinkCommand(
  supabase: ServiceClient,
  normalizedPhone: string,
  code: string,
  extraTools: AgentTool[] = []
): Promise<string> {
  const result = await consumePairingChallenge(supabase, normalizedPhone, code);
  if (!result.ok) {
    const reasonText: Record<typeof result.reason, string> = {
      not_found: "That code isn't recognized. Generate a new one from the Stratxcel dashboard.",
      expired: "That code has expired. Generate a new one from the Stratxcel dashboard.",
      already_used: "That code has already been used. Generate a new one from the Stratxcel dashboard.",
    };
    return formatAgentReply({ text: reasonText[result.reason] });
  }

  await touchPrincipalLastUsed(supabase, normalizedPhone);
  await auditPrincipalLinked(supabase, {
    authUserId: result.authUserId,
    tenantId: result.tenantId,
    principalType: result.principalType,
    channel: "whatsapp",
  });

  const resolution = await resolveWhatsAppPrincipal(supabase, normalizedPhone, "whatsapp");
  if (resolution.status !== "resolved") return formatAgentReply({ text: "Your number is linked. Send WHOAMI to check access." });
  const principal = resolution.principal;
  const capabilities = capabilityGroupsFromTools(resolveAgentTools(principal, { extraTools }));
  const lines = [
    "✅ Stratxcel Agent connected",
    "Your WhatsApp is now securely linked to your Stratxcel account.",
    `Role: ${principal.role.replaceAll("_", " ")}`,
    principal.kind === "staff" ? `Access: ${(principal.accessProfile ?? "role_default").replaceAll("_", " ")}` : "Access: Client Agent",
    capabilities.length ? `I can help with:\n• ${capabilities.slice(0, 7).map((item) => item.name).join("\n• ")}` : "No Agent data categories are assigned yet.",
    capabilities.some((item) => item.risk === "low_mutation") ? "Eligible low-risk changes require a confirmation code." : "Your access is read-only.",
    "Security, payment, destructive and high-risk actions remain dashboard-only.",
    "Commands: HELP · WHOAMI · RESET / NEW CHAT · CONFIRM <code> · CANCEL <code>",
  ];
  return formatAgentReply({ text: lines.join("\n\n") });
}

export function handleWhoAmI(resolution: AgentPrincipalResolution, extraTools: AgentTool[] = []): string {
  if (resolution.status === "resolved") {
    return formatAgentReply({
      text: formatWhoAmI(resolution, capabilityGroupsFromTools(resolveAgentTools(resolution.principal, { extraTools }))),
    });
  }
  return formatAgentReply({ text: formatWhoAmI(resolution) });
}

export async function handleReset(supabase: ServiceClient, principal: AgentPrincipal): Promise<string> {
  await resetAgentSession(supabase, principal);
  return formatAgentReply({ text: "Started a new conversation. Your account link is unchanged." });
}

export function handleHelp(principal: AgentPrincipal, extraTools: AgentTool[] = []): string {
  return formatPermissionAwareHelp(principal, capabilityGroupsFromTools(resolveAgentTools(principal, { extraTools })));
}

export interface ConfirmOutcome {
  reply: string;
  executed: boolean;
}

/**
 * CONFIRM <code> — re-executes EXACTLY the stored action_name + normalized_input
 * from the confirmation row. The model never reinterprets what is being
 * confirmed (PHASE 21). Re-checks the tool is still in this principal's
 * CURRENT resolved tool set at execution time (defense in depth against a
 * permission change between proposal and confirmation).
 */
export async function handleConfirm(
  supabase: ServiceClient,
  principal: AgentPrincipal,
  code: string,
  extraTools: AgentTool[] = []
): Promise<ConfirmOutcome> {
  const result = await consumeActionConfirmation(supabase, principal.authUserId, code);
  if (!result.ok) {
    const reasonText: Record<typeof result.reason, string> = {
      not_found: "That confirmation code isn't recognized.",
      expired: "That confirmation has expired — please ask again.",
      already_used: "That confirmation has already been used.",
      cancelled: "That confirmation was cancelled.",
      principal_mismatch: "That confirmation code isn't recognized.",
    };
    return { reply: formatAgentReply({ text: reasonText[result.reason] }), executed: false };
  }

  const tools = resolveAgentTools(principal, { extraTools });
  const tool = tools.find((t) => t.schema.name === result.actionName);
  if (!tool) {
    await auditFailedAction(supabase, principal, { reason: `confirmed_tool_no_longer_authorized:${result.actionName}` });
    return {
      reply: formatAgentReply({ text: "That action is no longer available. Please ask again from the dashboard." }),
      executed: false,
    };
  }

  try {
    const output = await tool.execute({ principal, supabase }, result.normalizedInput);
    await auditConfirmationExecuted(supabase, principal, { confirmationId: result.id, actionName: result.actionName });
    return {
      reply: formatAgentReply({ text: "Done.", toolSummaries: [summarizeToolResult(tool.schema.name, output)] }),
      executed: true,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown_error";
    await auditFailedAction(supabase, principal, { reason: `confirmation_execute_failed:${reason}` });
    return {
      reply: formatAgentReply({ text: "That action failed to complete. Please try again or use the dashboard." }),
      executed: false,
    };
  }
}

export async function handleCancel(supabase: ServiceClient, principal: AgentPrincipal, code: string): Promise<string> {
  const result = await cancelActionConfirmation(supabase, principal.authUserId, code);
  if (!result.ok) {
    return formatAgentReply({ text: "That confirmation code isn't recognized or was already resolved." });
  }
  await auditConfirmationCancelled(supabase, principal, { confirmationId: result.id });
  return formatAgentReply({ text: "Cancelled." });
}
