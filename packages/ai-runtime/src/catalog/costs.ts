import type { AICostMetadata, AIProviderId, AIUsage } from "../types.ts";
import { MODEL_CATALOG, type ModelCatalogKey, resolveModelId } from "./models.ts";

/**
 * Centralized pricing metadata for estimation/accounting only.
 * Provider billing dashboards remain authoritative — these are not invoices.
 */
export const COST_CATALOG: Record<string, AICostMetadata> = {
  [MODEL_CATALOG.GOOGLE_CHEAP.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_CHEAP.id,
    unit: "token",
    inputUsdPerMillion: 0.1,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 0.4,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for Gemini Flash-Lite class",
  },
  [MODEL_CATALOG.GOOGLE_STANDARD.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_STANDARD.id,
    unit: "token",
    inputUsdPerMillion: 0.3,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 2.5,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for Gemini Flash class",
  },
  [MODEL_CATALOG.OPENAI_CHEAP_FALLBACK.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_CHEAP_FALLBACK.id,
    unit: "token",
    inputUsdPerMillion: 0.1,
    cachedInputUsdPerMillion: 0.025,
    outputUsdPerMillion: 0.4,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for GPT nano class",
  },
  [MODEL_CATALOG.OPENAI_STANDARD_FALLBACK.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_STANDARD_FALLBACK.id,
    unit: "token",
    inputUsdPerMillion: 0.4,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 1.6,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for GPT mini class",
  },
  [MODEL_CATALOG.OPENAI_COST_SENSITIVE_STRONG.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_COST_SENSITIVE_STRONG.id,
    unit: "token",
    inputUsdPerMillion: 1.0,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 4.0,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for Luna class",
  },
  [MODEL_CATALOG.OPENAI_PREMIUM.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_PREMIUM.id,
    unit: "token",
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.625,
    outputUsdPerMillion: 10.0,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for Terra class",
  },
  [MODEL_CATALOG.OPENAI_FRONTIER.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_FRONTIER.id,
    unit: "token",
    inputUsdPerMillion: 5.0,
    cachedInputUsdPerMillion: 1.25,
    outputUsdPerMillion: 20.0,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal COGS estimate for Sol class",
  },
  [MODEL_CATALOG.GOOGLE_IMAGE_FAST.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_IMAGE_FAST.id,
    unit: "image",
    imageUnitCostUsd: 0.01,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal image unit estimate (lite)",
  },
  [MODEL_CATALOG.GOOGLE_IMAGE_STANDARD.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_IMAGE_STANDARD.id,
    unit: "image",
    imageUnitCostUsd: 0.04,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal image unit estimate (standard)",
  },
  [MODEL_CATALOG.GOOGLE_IMAGE_PREMIUM.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_IMAGE_PREMIUM.id,
    unit: "image",
    imageUnitCostUsd: 0.12,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal image unit estimate (premium)",
  },
  [MODEL_CATALOG.OPENAI_IMAGE_FALLBACK.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_IMAGE_FALLBACK.id,
    unit: "image",
    imageUnitCostUsd: 0.08,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal image unit estimate (OpenAI fallback)",
  },
  [MODEL_CATALOG.GOOGLE_VIDEO_ECONOMY.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_VIDEO_ECONOMY.id,
    unit: "video_second",
    videoSecondCostUsd: 0.05,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal Veo lite estimate",
  },
  [MODEL_CATALOG.GOOGLE_VIDEO_FAST.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_VIDEO_FAST.id,
    unit: "video_second",
    videoSecondCostUsd: 0.1,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal Veo fast estimate",
  },
  [MODEL_CATALOG.GOOGLE_VIDEO_PREMIUM.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_VIDEO_PREMIUM.id,
    unit: "video_second",
    videoSecondCostUsd: 0.2,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal Veo standard estimate",
  },
  [MODEL_CATALOG.NORMAL_TRANSCRIPTION.id]: {
    provider: "openai",
    model: MODEL_CATALOG.NORMAL_TRANSCRIPTION.id,
    unit: "audio_minute",
    audioUnitCostUsd: 0.003,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal transcription estimate",
  },
  [MODEL_CATALOG.NORMAL_TTS.id]: {
    provider: "openai",
    model: MODEL_CATALOG.NORMAL_TTS.id,
    unit: "audio_minute",
    audioUnitCostUsd: 0.015,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal TTS estimate",
  },
  [MODEL_CATALOG.PREMIUM_TTS.id]: {
    provider: "openai",
    model: MODEL_CATALOG.PREMIUM_TTS.id,
    unit: "audio_minute",
    audioUnitCostUsd: 0.03,
    verifiedAt: "2026-08-11",
    sourceNote: "Internal premium TTS estimate",
  },
};

export function getCostMetadata(model: string): AICostMetadata | undefined {
  return COST_CATALOG[model];
}

export function estimateTokenCostUsd(args: {
  model: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
}): number {
  const meta = getCostMetadata(args.model);
  if (!meta || meta.unit !== "token") return 0;
  const cached = Math.min(args.cachedInputTokens ?? 0, args.inputTokens);
  const uncached = Math.max(0, args.inputTokens - cached);
  const input =
    (uncached / 1_000_000) * (meta.inputUsdPerMillion ?? 0) +
    (cached / 1_000_000) * (meta.cachedInputUsdPerMillion ?? meta.inputUsdPerMillion ?? 0);
  const output = (args.outputTokens / 1_000_000) * (meta.outputUsdPerMillion ?? 0);
  return roundUsd(input + output);
}

export function estimateImageCostUsd(model: string, imageCount: number): number {
  const meta = getCostMetadata(model);
  if (!meta?.imageUnitCostUsd) return 0;
  return roundUsd(meta.imageUnitCostUsd * imageCount);
}

export function estimateVideoCostUsd(model: string, seconds: number): number {
  const meta = getCostMetadata(model);
  if (!meta?.videoSecondCostUsd) return 0;
  return roundUsd(meta.videoSecondCostUsd * seconds);
}

export function buildUsage(args: {
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  mediaUnits?: number;
  estimatedCostUsd?: number;
}): AIUsage {
  const inputTokens = args.inputTokens ?? 0;
  const cachedInputTokens = args.cachedInputTokens ?? 0;
  const outputTokens = args.outputTokens ?? 0;
  const estimatedCostUsd =
    args.estimatedCostUsd ??
    estimateTokenCostUsd({
      model: args.model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
    });
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    mediaUnits: args.mediaUnits,
    estimatedCostUsd,
  };
}

export function resolveCatalogCostKey(key: ModelCatalogKey): AICostMetadata | undefined {
  return getCostMetadata(resolveModelId(key));
}

export function listCostEntriesForProvider(provider: AIProviderId): AICostMetadata[] {
  return Object.values(COST_CATALOG).filter((c) => c.provider === provider);
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
