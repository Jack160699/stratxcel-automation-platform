/**
 * Provider-neutral Social outbound boundary.
 * Same permitted data class for Google and OpenAI — fallback never widens.
 */

import { sanitizeGeminiText } from "./gemini-boundary.ts";

export interface SocialBoundaryMessage {
  role: "system" | "user" | "assistant" | "tool" | "developer";
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  functionCallName?: string;
  functionCallArguments?: string;
}

export interface SocialBoundaryContext {
  brandInstructions: string[];
  contentIdeas?: string[];
  draftCaptions?: string[];
  businessInformation?: string[];
  creativeImages?: Array<{ mimeType: string; data: string }>;
}

export interface SocialOutboundEnvelope {
  messages: SocialBoundaryMessage[];
  context: {
    brandInstructions: string[];
    contentIdeas: string[];
    draftCaptions: string[];
    businessInformation: string[];
    creativeImages?: Array<{ mimeType: string; data: string }>;
  };
}

/**
 * Sanitize conversation + Brand/business context before ANY provider hop.
 * Applies the same Platform-data sanitize to system/user/assistant/tool
 * so OpenAI fallback never receives a wider data class than Google.
 * Preserves toolCallId / toolName / toolCalls order and IDs.
 */
export function buildSocialOutboundBoundary(args: {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool" | "developer";
    content: string;
    toolCallId?: string;
    toolName?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    functionCallName?: string;
    functionCallArguments?: string;
  }>;
  context: SocialBoundaryContext;
}): SocialOutboundEnvelope {
  const context = {
    brandInstructions: args.context.brandInstructions.map(sanitizeGeminiText),
    contentIdeas: (args.context.contentIdeas ?? []).map(sanitizeGeminiText),
    draftCaptions: (args.context.draftCaptions ?? []).map(sanitizeGeminiText),
    businessInformation: (args.context.businessInformation ?? []).map(sanitizeGeminiText),
    creativeImages: args.context.creativeImages,
  };

  const messages: SocialBoundaryMessage[] = args.messages.map((m) => ({
    ...m,
    content: sanitizeGeminiText(m.content),
    functionCallArguments: m.functionCallArguments
      ? sanitizeGeminiText(m.functionCallArguments)
      : undefined,
    toolCalls: m.toolCalls?.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: sanitizeToolArgs(call.arguments),
    })),
  }));

  return { messages, context };
}

function sanitizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") out[key] = sanitizeGeminiText(value);
    else if (Array.isArray(value)) {
      out[key] = value.map((v) => (typeof v === "string" ? sanitizeGeminiText(v) : v));
    } else if (value && typeof value === "object") {
      out[key] = sanitizeToolArgs(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function assertSocialOutboundSafe(envelope: SocialOutboundEnvelope): void {
  const blob = JSON.stringify(envelope);
  if (/EAAG[A-Za-z0-9]+/.test(blob) || /sk-[a-zA-Z0-9]{20,}/.test(blob) || /AIza[0-9A-Za-z_-]{20,}/.test(blob)) {
    throw new Error("social_outbound_boundary_secret_leak");
  }
  const stripped = blob
    .replace(/\[REDACTED PLATFORM DATA\]/gi, "")
    .replace(/\[REDACTED SECRET\]/gi, "")
    .replace(/\[REDACTED HANDLE\]/gi, "")
    .replace(/\[REDACTED IDENTIFIER\]/gi, "");
  if (/\b(?:insights?|analytics|page\s+id|access[_ -]?token)\b/i.test(stripped)) {
    throw new Error("social_outbound_boundary_platform_data_leak");
  }
}

export function mapCopilotIntentToTaskClass(
  intent: string,
): "ROUTING" | "GENERAL_SPECIALIST" | "CONTENT" | "STRATEGY" {
  switch (intent) {
    case "CLASSIFY":
      return "ROUTING";
    case "PREPARE_CONTENT":
    case "REVISE_CURRENT_ARTIFACT":
    case "POST_NOW_REQUEST":
    case "FUTURE_SCHEDULE_REQUEST":
    case "PREPARE_WEEK_PLAN":
      return "CONTENT";
    case "CAMPAIGN_STRATEGY":
      return "STRATEGY";
    default:
      return "GENERAL_SPECIALIST";
  }
}
