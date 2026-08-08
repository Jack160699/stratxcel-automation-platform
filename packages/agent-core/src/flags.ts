/**
 * Feature flags for the agent core / WhatsApp agent channel.
 *
 * Follows the exact fail-closed, strict-string-comparison precedent set by
 * packages/whatsapp/src/flags.ts (isAutoReplyEnabled). Deliberately a small
 * local module rather than a shared flags package — see that file's comment.
 */

/** Master switch for routing WhatsApp traffic through the agent core at all.
 *  MUST default to false. Absent or any value other than exactly "true" is
 *  treated as disabled (fail closed). */
export function isWhatsAppAgentChannelEnabled(): boolean {
  return process.env.WHATSAPP_AGENT_CHANNEL_ENABLED === "true";
}

/** Whether the HMAC-authenticated internal agent endpoint is allowed to run
 *  at all. Distinct from the worker-side routing flag so the endpoint and
 *  the worker's use of it can be toggled independently during rollout. */
export function isInternalAgentEndpointEnabled(): boolean {
  return process.env.WHATSAPP_AGENT_CHANNEL_ENABLED === "true";
}
