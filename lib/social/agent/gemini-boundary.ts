import type { BrandProfileRow } from "../repositories/brand";

export const GEMINI_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_GENERATE_CONTENT_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** One turn of real conversation history — used (instead of the flattened
 *  `userPrompts` list) whenever the caller needs genuine multi-round
 *  tool-calling: assistant/tool turns must reach Gemini for it to reason
 *  about prior tool results, which `userPrompts` alone cannot represent. */
export interface GeminiConversationTurn {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

/** Mirrors ToolSchema from provider.ts (name/description/JSON-Schema
 *  parameters) without importing it, keeping this module's own allowlist
 *  boundary — see buildGeminiRequest's doc comment — independent of the
 *  provider module's types. */
export interface GeminiToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface GeminiBoundaryInput {
  userPrompts: string[];
  brandInstructions: string[];
  contentIdeas: string[];
  draftCaptions: string[];
  businessInformation: string[];
  /** Optional: full ordered conversation (user/assistant/tool turns) for a
   *  real multi-round tool-calling caller. When present, this replaces
   *  `userPrompts` for building `contents` (userPrompts is otherwise still
   *  honored for simple single-shot callers). */
  conversation?: GeminiConversationTurn[];
  /** Optional: caller-supplied system instruction (e.g. a channel-specific
   *  Agent Core system prompt). Falls back to the fixed Social Copilot
   *  instruction below when omitted, preserving existing callers exactly. */
  systemInstruction?: string;
  /** Optional: function-calling declarations. Omitted entirely from the
   *  request (not even an empty array) when there are none, to keep the
   *  request shape byte-identical to before for every existing caller —
   *  see gemini-boundary.test.ts's exact Object.keys() assertion. */
  tools?: GeminiToolDeclaration[];
}

export interface GeminiContentPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: string } };
}

export interface GeminiGenerateContentRequest {
  system_instruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: "user" | "model"; parts: GeminiContentPart[] }>;
  generationConfig: { maxOutputTokens: number };
  tools?: Array<{ functionDeclarations: GeminiToolDeclaration[] }>;
}

const DEFAULT_SYSTEM_INSTRUCTION =
  "You are Stratxcel Copilot. Help with non-Platform brand and content drafting only. Never request or infer social-account data, comments, messages, insights, analytics, identifiers, tokens, permissions, connection state, or provider-fetched media.";

function mapConversationTurn(turn: GeminiConversationTurn): { role: "user" | "model"; parts: GeminiContentPart[] } | null {
  // NOTE: intentionally NOT sanitizeGeminiText() here — that function's
  // PLATFORM_DATA_TERM/META_DATA_LABEL/LONG_IDENTIFIER redactions target
  // Social/Meta-specific vocabulary ("messages", "comments", "performance",
  // 8-20 digit IDs — which include ordinary phone numbers) and would
  // corrupt legitimate Agent Core admin/client conversation about leads,
  // missions, or phone numbers. `conversation` turns come from our own
  // orchestrators (persisted Social messages, or Agent Core's tool-summary
  // formatter), not raw external API payloads, so only the narrow
  // secret-token pattern is redacted here as defense-in-depth.
  const text = redactSecretValues(turn.content ?? "");
  if (turn.role === "tool") {
    // Gemini's generateContent API has no "function"/"tool" role — a
    // function result is represented as a functionResponse part inside a
    // "user" turn (there is no separate role for it in v1beta).
    return { role: "user", parts: [{ functionResponse: { name: turn.toolName || "unknown_tool", response: { content: text } } }] };
  }
  if (!text) return null; // Gemini rejects turns with empty parts.
  return { role: turn.role === "assistant" ? "model" : "user", parts: [{ text }] };
}

const META_DATA_LABEL = /\b(?:meta|facebook|instagram|threads)\s+(?:account|page|profile|user|username|display\s*name|id|identifier|token|permission|scope|comment|message|insight|metric|analytics|media|metadata|connection\s*status)\b/gi;
const PLATFORM_DATA_TERM = /\b(?:insights?|analytics|metrics?|performance|reach|impressions?|engagement|followers?|comments?|messages?|inbox|connected\s+accounts?|connection\s+status|page\s+id|account\s+id|user\s+id|username|display\s+name|permissions?)\b/gi;
const SECRET_VALUE = /\b(?:bearer\s+|access[_ -]?token\s*[:=]\s*|refresh[_ -]?token\s*[:=]\s*)[^\s,;]+/gi;
const SOCIAL_HANDLE = /(^|\s)@[a-z0-9._-]{2,}/gi;
const LONG_IDENTIFIER = /\b\d{8,20}\b/g;

export function sanitizeGeminiText(value: string): string {
  return value
    .replace(SECRET_VALUE, "[REDACTED SECRET]")
    .replace(META_DATA_LABEL, "[REDACTED PLATFORM DATA]")
    .replace(PLATFORM_DATA_TERM, "[REDACTED PLATFORM DATA]")
    .replace(SOCIAL_HANDLE, "$1[REDACTED HANDLE]")
    .replace(LONG_IDENTIFIER, "[REDACTED IDENTIFIER]")
    .slice(0, 12_000);
}

/** Narrow defense-in-depth redaction (bearer/access/refresh tokens only) —
 *  see mapConversationTurn's comment for why the full Social-specific
 *  sanitizeGeminiText() above must not be applied to general Agent Core
 *  conversation text. */
function redactSecretValues(value: string): string {
  return value.replace(SECRET_VALUE, "[REDACTED SECRET]").slice(0, 12_000);
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value): value is string => typeof value === "string")
    .map(sanitizeGeminiText)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 40);
}

/**
 * The only constructor allowed to create a Gemini request. It copies five
 * explicit non-Platform fields and ignores every other property, including
 * nested database records, account objects, tokens, metrics, and metadata.
 */
export function buildGeminiRequest(input: GeminiBoundaryInput): GeminiGenerateContentRequest {
  const allowed = {
    userPrompts: cleanList(input.userPrompts),
    brandInstructions: cleanList(input.brandInstructions),
    contentIdeas: cleanList(input.contentIdeas),
    draftCaptions: cleanList(input.draftCaptions),
    businessInformation: cleanList(input.businessInformation),
  };

  const context = [
    ...allowed.brandInstructions.map((text) => `Brand instruction: ${text}`),
    ...allowed.contentIdeas.map((text) => `Content idea: ${text}`),
    ...allowed.draftCaptions.map((text) => `Draft caption: ${text}`),
    ...allowed.businessInformation.map((text) => `Business information: ${text}`),
  ];
  const contextTurns = context.map((text) => ({ role: "user" as const, parts: [{ text }] }));

  const conversationTurns = input.conversation
    ? input.conversation.map(mapConversationTurn).filter((turn): turn is { role: "user" | "model"; parts: GeminiContentPart[] } => turn !== null)
    : allowed.userPrompts.map((text) => ({ role: "user" as const, parts: [{ text }] }));

  const toolDeclarations = Array.isArray(input.tools)
    ? input.tools
        .filter((tool): tool is GeminiToolDeclaration => Boolean(tool && typeof tool.name === "string"))
        .map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))
    : [];

  return {
    system_instruction: {
      parts: [{ text: input.systemInstruction ? sanitizeGeminiText(input.systemInstruction) : DEFAULT_SYSTEM_INSTRUCTION }],
    },
    contents: [...contextTurns, ...conversationTurns],
    generationConfig: { maxOutputTokens: 1024 },
    ...(toolDeclarations.length ? { tools: [{ functionDeclarations: toolDeclarations }] } : {}),
  };
}

export type SocialPromptIntent = "LOCAL_PLATFORM_DATA" | "CREATIVE" | "MIXED" | "GENERAL";

const ANALYTICS_DATA_SUBJECT =
  /\b(?:insights?|analytics|metrics?|performance|reach|impressions?|engagement|followers?|comments?|messages?|inbox)\b/i;
const ACCOUNT_DATA_SUBJECT =
  /\b(?:connected\s+(?:accounts?|platforms?)|connections?|connection\s+status|account\s+(?:status|health)|page\s+id|account\s+id|user\s+id|username|display\s+name|permissions?|access\s+tokens?)\b/i;
const PLATFORM_READ_ACTION =
  /\b(?:show|list|read|check|compare|analy[sz]e|summari[sz]e|review|report|tell|give|what|which|how(?:\s+many|\s+is|\s+are)|based\s+on|dikha|bata|dekho?|dekhna|check\s+karo|compare\s+karo)\b/i;
const ACCOUNT_READ_ACTION =
  /\b(?:show|list|read|check|status|health|how\s+many|what\s+is|tell\s+me|dikha|check\s+karo)\b/i;
const CREATIVE_ACTION =
  /\b(?:create|make|draft|write|prepare|generate|suggest|recommend|adapt|caption|content|post(?:ing)?|publish|schedule|preview|version|variant|suitable|relevant|ready|bana(?:o|na|do|dena)?|likh(?:o|na|do)?|taiyar|alag|caption\s+bana|post\s+karo)\b/i;

/**
 * Routes by the user's mission, not by isolated nouns. Platform names and
 * "connected accounts" are valid creative destination context. A request is
 * local-only only when it asks to read/analyse workspace Platform data and
 * contains no content/publishing objective. Mixed missions preserve both
 * halves: local derivation first, creative workflow second.
 */
export function classifySocialPromptIntent(prompt: string): SocialPromptIntent {
  const hasDataRead = (ANALYTICS_DATA_SUBJECT.test(prompt) && PLATFORM_READ_ACTION.test(prompt)) ||
    (ACCOUNT_DATA_SUBJECT.test(prompt) && ACCOUNT_READ_ACTION.test(prompt));
  const hasCreative = CREATIVE_ACTION.test(prompt);
  if (hasDataRead && hasCreative) return "MIXED";
  if (hasDataRead) return "LOCAL_PLATFORM_DATA";
  if (hasCreative) return "CREATIVE";
  return "GENERAL";
}

export function requiresLocalMetaHandling(prompt: string): boolean {
  return classifySocialPromptIntent(prompt) === "LOCAL_PLATFORM_DATA";
}

export function selectGeminiBrandInstructions(profile: BrandProfileRow): string[] {
  return cleanList([
    profile.identity.name,
    profile.identity.industry,
    profile.identity.positioning,
    profile.identity.business_model,
    profile.identity.description,
    ...profile.voice.tone,
    ...profile.voice.blocked_phrases,
    ...profile.voice.forbidden_claims,
    ...profile.products.flatMap((product) => [product.name, product.description, product.audience, product.benefits, product.cta]),
    ...profile.content_pillars.flatMap((pillar) => [pillar.name, pillar.description]),
    ...profile.rules.map((rule) => rule.text),
  ]);
}
