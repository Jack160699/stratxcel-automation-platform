import type { ProviderDefinition } from "./types.ts";

/**
 * Static provider registry — capability flags drive routing decisions
 * (e.g. "which connected provider can do vision for this tenant"). Adding
 * a provider is adding an entry here, not a schema change.
 */
export const PROVIDER_REGISTRY: readonly ProviderDefinition[] = [
  { key: "openai", label: "OpenAI", capabilities: { text: true, vision: true, image: true, speech: true }, keyFormatHint: "sk-..." },
  { key: "anthropic", label: "Anthropic", capabilities: { text: true, vision: true }, keyFormatHint: "sk-ant-..." },
  { key: "google", label: "Google AI", capabilities: { text: true, vision: true, image: true, video: true, speech: true, search: true }, keyFormatHint: "AIza..." },
  { key: "elevenlabs", label: "ElevenLabs", capabilities: { speech: true }, keyFormatHint: "32-character hex key" },
  { key: "stability", label: "Stability AI", capabilities: { image: true, video: true }, keyFormatHint: "sk-..." },
] as const;

export function getProviderDefinition(key: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find((p) => p.key === key);
}

export function listProvidersForCapability(capability: keyof ProviderDefinition["capabilities"]): ProviderDefinition[] {
  return PROVIDER_REGISTRY.filter((p) => p.capabilities[capability]);
}
