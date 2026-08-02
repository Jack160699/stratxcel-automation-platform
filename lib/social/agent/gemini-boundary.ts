import type { BrandProfileRow } from "../repositories/brand";

export const GEMINI_MODEL = "gemini-2.5-flash-lite";
export const GEMINI_GENERATE_CONTENT_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface GeminiBoundaryInput {
  userPrompts: string[];
  brandInstructions: string[];
  contentIdeas: string[];
  draftCaptions: string[];
  businessInformation: string[];
}

export interface GeminiGenerateContentRequest {
  system_instruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: "user"; parts: Array<{ text: string }> }>;
  generationConfig: { maxOutputTokens: number };
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

  return {
    system_instruction: {
      parts: [{ text: "You are Stratxcel Copilot. Help with non-Platform brand and content drafting only. Never request or infer social-account data, comments, messages, insights, analytics, identifiers, tokens, permissions, connection state, or provider-fetched media." }],
    },
    contents: [
      ...context.map((text) => ({ role: "user" as const, parts: [{ text }] })),
      ...allowed.userPrompts.map((text) => ({ role: "user" as const, parts: [{ text }] })),
    ],
    generationConfig: { maxOutputTokens: 1024 },
  };
}

export function requiresLocalMetaHandling(prompt: string): boolean {
  return /\b(?:insights?|analytics|metrics?|performance|reach|impressions?|engagement|followers?|comments?|messages?|inbox|connected\s+accounts?|connection\s+status|page\s+id|account\s+id|user\s+id|username|display\s+name|permissions?|access\s+tokens?)\b/i.test(prompt);
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
