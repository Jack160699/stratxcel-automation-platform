import type { AIModelDefinition } from "../types.ts";

/**
 * Single central model catalog. Do not scatter model ID strings across the repo.
 * Env overrides resolve at runtime via `resolveModelId`.
 */
export const MODEL_CATALOG = {
  GOOGLE_CHEAP: {
    id: "gemini-3.5-flash-lite",
    catalogKey: "GOOGLE_CHEAP",
    provider: "google",
    modality: "text",
    purpose: "Routing, classification, extraction, cheap specialist work",
    active: true,
    deprecated: false,
  },
  GOOGLE_STANDARD: {
    id: "gemini-3.6-flash",
    catalogKey: "GOOGLE_STANDARD",
    provider: "google",
    modality: "text",
    purpose: "Content, research, strategy, executive normal reasoning",
    active: true,
    deprecated: false,
  },
  OPENAI_CHEAP_FALLBACK: {
    id: "gpt-5.4-nano",
    catalogKey: "OPENAI_CHEAP_FALLBACK",
    provider: "openai",
    modality: "text",
    purpose: "Cheap OpenAI fallback for routing/extraction",
    active: true,
    deprecated: false,
  },
  OPENAI_STANDARD_FALLBACK: {
    id: "gpt-5.4-mini",
    catalogKey: "OPENAI_STANDARD_FALLBACK",
    provider: "openai",
    modality: "text",
    purpose: "Standard OpenAI fallback for general/content work",
    active: true,
    deprecated: false,
  },
  OPENAI_COST_SENSITIVE_STRONG: {
    id: "gpt-5.6-luna",
    catalogKey: "OPENAI_COST_SENSITIVE_STRONG",
    provider: "openai",
    modality: "text",
    purpose: "Cost-sensitive strong reasoning",
    active: true,
    deprecated: false,
  },
  OPENAI_PREMIUM: {
    id: "gpt-5.6-terra",
    catalogKey: "OPENAI_PREMIUM",
    provider: "openai",
    modality: "text",
    purpose: "Premium quality escalation / audit primary",
    active: true,
    deprecated: false,
  },
  OPENAI_FRONTIER: {
    id: "gpt-5.6-sol",
    catalogKey: "OPENAI_FRONTIER",
    provider: "openai",
    modality: "text",
    purpose: "Frontier escalation only for high-value justified work",
    active: true,
    deprecated: false,
  },
  GOOGLE_IMAGE_FAST: {
    id: "gemini-3.1-flash-lite-image",
    catalogKey: "GOOGLE_IMAGE_FAST",
    provider: "google",
    modality: "image",
    purpose: "Cheap/high-volume image iteration",
    active: true,
    deprecated: false,
  },
  GOOGLE_IMAGE_STANDARD: {
    id: "gemini-3.1-flash-image",
    catalogKey: "GOOGLE_IMAGE_STANDARD",
    provider: "google",
    modality: "image",
    purpose: "Normal social/content image generation",
    active: true,
    deprecated: false,
  },
  GOOGLE_IMAGE_PREMIUM: {
    id: "gemini-3-pro-image",
    catalogKey: "GOOGLE_IMAGE_PREMIUM",
    provider: "google",
    modality: "image",
    purpose: "Premium hero/product/design images",
    active: true,
    deprecated: false,
  },
  OPENAI_IMAGE_FALLBACK: {
    id: "gpt-image-2",
    catalogKey: "OPENAI_IMAGE_FALLBACK",
    provider: "openai",
    modality: "image",
    purpose: "Image generation fallback",
    active: true,
    deprecated: false,
  },
  GOOGLE_VIDEO_ECONOMY: {
    id: "veo-3.1-lite-generate-preview",
    catalogKey: "GOOGLE_VIDEO_ECONOMY",
    provider: "google",
    modality: "video",
    purpose: "Economy video generation",
    active: true,
    deprecated: false,
  },
  GOOGLE_VIDEO_FAST: {
    id: "veo-3.1-fast-generate-preview",
    catalogKey: "GOOGLE_VIDEO_FAST",
    provider: "google",
    modality: "video",
    purpose: "Quality-upgrade video generation",
    active: true,
    deprecated: false,
  },
  GOOGLE_VIDEO_PREMIUM: {
    id: "veo-3.1-generate-preview",
    catalogKey: "GOOGLE_VIDEO_PREMIUM",
    provider: "google",
    modality: "video",
    purpose: "Premium video generation",
    active: true,
    deprecated: false,
  },
  REALTIME_VOICE_PRIMARY: {
    id: "gpt-realtime-2.1-mini",
    catalogKey: "REALTIME_VOICE_PRIMARY",
    provider: "openai",
    modality: "realtime",
    purpose: "Realtime conversational voice",
    active: true,
    deprecated: false,
  },
  REALTIME_VOICE_GOOGLE_FALLBACK: {
    id: "gemini-3.1-flash-live-preview",
    catalogKey: "REALTIME_VOICE_GOOGLE_FALLBACK",
    provider: "google",
    modality: "realtime",
    purpose: "Realtime voice Google fallback",
    active: true,
    deprecated: false,
  },
  REALTIME_TRANSCRIPTION: {
    id: "gpt-realtime-whisper",
    catalogKey: "REALTIME_TRANSCRIPTION",
    provider: "openai",
    modality: "audio",
    purpose: "Realtime transcription",
    active: true,
    deprecated: false,
  },
  NORMAL_TRANSCRIPTION: {
    id: "gpt-4o-mini-transcribe",
    catalogKey: "NORMAL_TRANSCRIPTION",
    provider: "openai",
    modality: "audio",
    purpose: "Routine transcription",
    active: true,
    deprecated: false,
  },
  NORMAL_TTS: {
    id: "tts-1",
    catalogKey: "NORMAL_TTS",
    provider: "openai",
    modality: "audio",
    purpose: "Routine speech synthesis",
    active: true,
    deprecated: false,
  },
  PREMIUM_TTS: {
    id: "tts-1-hd",
    catalogKey: "PREMIUM_TTS",
    provider: "openai",
    modality: "audio",
    purpose: "Premium narration",
    active: true,
    deprecated: false,
  },
  GOOGLE_TTS_FALLBACK: {
    id: "gemini-3.1-flash-tts-preview",
    catalogKey: "GOOGLE_TTS_FALLBACK",
    provider: "google",
    modality: "audio",
    purpose: "Google TTS fallback",
    active: true,
    deprecated: false,
  },
} as const satisfies Record<string, AIModelDefinition>;

export type ModelCatalogKey = keyof typeof MODEL_CATALOG;

/** Explicitly NOT active — must never appear as provider choices. */
export const FORBIDDEN_MODELS = [
  "sora-2",
  "sora-2-pro",
  "gpt-4o-mini-tts",
] as const;

const ENV_OVERRIDES: Partial<Record<ModelCatalogKey, string>> = {
  GOOGLE_CHEAP: "AI_GOOGLE_CHEAP_MODEL",
  GOOGLE_STANDARD: "AI_GOOGLE_STANDARD_MODEL",
  OPENAI_CHEAP_FALLBACK: "AI_OPENAI_NANO_MODEL",
  OPENAI_STANDARD_FALLBACK: "AI_OPENAI_MINI_MODEL",
  OPENAI_COST_SENSITIVE_STRONG: "AI_OPENAI_LUNA_MODEL",
  OPENAI_PREMIUM: "AI_OPENAI_TERRA_MODEL",
  OPENAI_FRONTIER: "AI_OPENAI_SOL_MODEL",
  GOOGLE_IMAGE_FAST: "AI_GOOGLE_IMAGE_FAST_MODEL",
  GOOGLE_IMAGE_STANDARD: "AI_GOOGLE_IMAGE_MODEL",
  GOOGLE_IMAGE_PREMIUM: "AI_GOOGLE_IMAGE_PREMIUM_MODEL",
  OPENAI_IMAGE_FALLBACK: "AI_OPENAI_IMAGE_MODEL",
  GOOGLE_VIDEO_ECONOMY: "AI_GOOGLE_VIDEO_LITE_MODEL",
  GOOGLE_VIDEO_FAST: "AI_GOOGLE_VIDEO_FAST_MODEL",
  GOOGLE_VIDEO_PREMIUM: "AI_GOOGLE_VIDEO_PREMIUM_MODEL",
};

export function resolveModelId(key: ModelCatalogKey, env: NodeJS.ProcessEnv = process.env): string {
  const envName = ENV_OVERRIDES[key];
  if (envName) {
    const override = env[envName]?.trim();
    if (override) {
      if ((FORBIDDEN_MODELS as readonly string[]).includes(override.toLowerCase())) {
        throw new Error(`forbidden_model_override:${override}`);
      }
      return override;
    }
  }
  return MODEL_CATALOG[key].id;
}

export function getModelDefinition(key: ModelCatalogKey): AIModelDefinition {
  return MODEL_CATALOG[key];
}

export function listActiveModels(): AIModelDefinition[] {
  return Object.values(MODEL_CATALOG).filter((m) => m.active && !m.deprecated);
}

export function isForbiddenModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (FORBIDDEN_MODELS as readonly string[]).some((f) => lower.includes(f));
}

export function assertActiveModel(modelId: string): void {
  if (isForbiddenModel(modelId)) {
    throw new Error(`forbidden_model:${modelId}`);
  }
}
