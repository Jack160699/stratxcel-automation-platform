import type { AICostMetadata, AIProviderId, AIUsage } from "../types.ts";
import { MODEL_CATALOG, type ModelCatalogKey, resolveModelId } from "./models.ts";

/**
 * Official provider pricing metadata for estimation/accounting only.
 * Provider billing dashboards remain authoritative — these are not invoices.
 * verifiedAt: 2026-08-11 from ai.google.dev/gemini-api/docs/pricing and OpenAI pricing docs.
 */

export type ImageResolution = "0.5K" | "1K" | "2K" | "4K";
export type ImageQuality = "low" | "medium" | "high";
export type VideoResolution = "720p" | "1080p" | "4k";

export interface AICostMetadataExtended extends AICostMetadata {
  pricingDimension: "token" | "image_resolution" | "image_token" | "video_resolution_second" | "audio_minute";
  source: "openai" | "google";
  /** Resolution → USD for fixed image unit pricing (Google). */
  imageByResolutionUsd?: Partial<Record<ImageResolution, number>>;
  /** Quality+size estimates for OpenAI gpt-image-2 (approx from official calculator). */
  openaiImageApproxUsd?: Partial<Record<ImageQuality, Partial<Record<string, number>>>>;
  /** OpenAI gpt-image-2 token rates when token counts are known. */
  textInputUsdPerMillion?: number;
  imageInputUsdPerMillion?: number;
  imageOutputUsdPerMillion?: number;
  cachedTextInputUsdPerMillion?: number;
  cachedImageInputUsdPerMillion?: number;
  /** Resolution → USD/sec for Veo. */
  videoByResolutionUsdPerSecond?: Partial<Record<VideoResolution, number>>;
}

export const COST_CATALOG: Record<string, AICostMetadataExtended> = {
  [MODEL_CATALOG.GOOGLE_CHEAP.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_CHEAP.id,
    unit: "token",
    pricingDimension: "token",
    source: "google",
    inputUsdPerMillion: 0.3,
    cachedInputUsdPerMillion: 0.03,
    outputUsdPerMillion: 2.5,
    verifiedAt: "2026-08-11",
    sourceNote: "Official Gemini Developer API pricing — Gemini 3.5 Flash-Lite paid tier",
  },
  [MODEL_CATALOG.GOOGLE_STANDARD.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_STANDARD.id,
    unit: "token",
    pricingDimension: "token",
    source: "google",
    inputUsdPerMillion: 1.5,
    cachedInputUsdPerMillion: 0.15,
    outputUsdPerMillion: 7.5,
    verifiedAt: "2026-08-11",
    sourceNote: "Official Gemini Developer API pricing — Gemini 3.6 Flash paid tier",
  },
  [MODEL_CATALOG.OPENAI_CHEAP_FALLBACK.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_CHEAP_FALLBACK.id,
    unit: "token",
    pricingDimension: "token",
    source: "openai",
    inputUsdPerMillion: 0.2,
    cachedInputUsdPerMillion: 0.02,
    outputUsdPerMillion: 1.25,
    verifiedAt: "2026-08-11",
    sourceNote: "Official OpenAI pricing — gpt-5.4-nano",
  },
  [MODEL_CATALOG.OPENAI_STANDARD_FALLBACK.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_STANDARD_FALLBACK.id,
    unit: "token",
    pricingDimension: "token",
    source: "openai",
    inputUsdPerMillion: 0.75,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 4.5,
    verifiedAt: "2026-08-11",
    sourceNote: "Official OpenAI pricing — gpt-5.4-mini",
  },
  [MODEL_CATALOG.OPENAI_COST_SENSITIVE_STRONG.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_COST_SENSITIVE_STRONG.id,
    unit: "token",
    pricingDimension: "token",
    source: "openai",
    inputUsdPerMillion: 1.0,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 6.0,
    verifiedAt: "2026-08-11",
    sourceNote: "Official OpenAI pricing — gpt-5.6-luna",
  },
  [MODEL_CATALOG.OPENAI_PREMIUM.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_PREMIUM.id,
    unit: "token",
    pricingDimension: "token",
    source: "openai",
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 15.0,
    verifiedAt: "2026-08-11",
    sourceNote: "Official OpenAI pricing — gpt-5.6-terra",
  },
  [MODEL_CATALOG.OPENAI_FRONTIER.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_FRONTIER.id,
    unit: "token",
    pricingDimension: "token",
    source: "openai",
    inputUsdPerMillion: 5.0,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30.0,
    verifiedAt: "2026-08-11",
    sourceNote: "Official OpenAI pricing — gpt-5.6-sol",
  },
  [MODEL_CATALOG.GOOGLE_IMAGE_FAST.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_IMAGE_FAST.id,
    unit: "image",
    pricingDimension: "image_resolution",
    source: "google",
    imageUnitCostUsd: 0.0336,
    imageByResolutionUsd: { "1K": 0.0336 },
    verifiedAt: "2026-08-11",
    sourceNote: "Official Gemini 3.1 Flash Lite Image — ~$0.0336 per 1K image",
  },
  [MODEL_CATALOG.GOOGLE_IMAGE_STANDARD.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_IMAGE_STANDARD.id,
    unit: "image",
    pricingDimension: "image_resolution",
    source: "google",
    imageUnitCostUsd: 0.067,
    imageByResolutionUsd: {
      "0.5K": 0.045,
      "1K": 0.067,
      "2K": 0.101,
      "4K": 0.151,
    },
    verifiedAt: "2026-08-11",
    sourceNote: "Official Gemini 3.1 Flash Image — resolution-aware image output pricing",
  },
  [MODEL_CATALOG.GOOGLE_IMAGE_PREMIUM.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_IMAGE_PREMIUM.id,
    unit: "image",
    pricingDimension: "image_resolution",
    source: "google",
    imageUnitCostUsd: 0.134,
    imageByResolutionUsd: {
      "1K": 0.134,
      "2K": 0.134,
      "4K": 0.24,
    },
    verifiedAt: "2026-08-11",
    sourceNote: "Official Gemini 3 Pro Image — 1K/2K $0.134, 4K $0.24 per image",
  },
  [MODEL_CATALOG.OPENAI_IMAGE_FALLBACK.id]: {
    provider: "openai",
    model: MODEL_CATALOG.OPENAI_IMAGE_FALLBACK.id,
    unit: "image",
    pricingDimension: "image_token",
    source: "openai",
    textInputUsdPerMillion: 5.0,
    cachedTextInputUsdPerMillion: 1.25,
    imageInputUsdPerMillion: 8.0,
    cachedImageInputUsdPerMillion: 2.0,
    imageOutputUsdPerMillion: 30.0,
    openaiImageApproxUsd: {
      low: { "1024x1024": 0.006, "1024x1536": 0.005, "1536x1024": 0.005 },
      medium: { "1024x1024": 0.053, "1024x1536": 0.041, "1536x1024": 0.041 },
      high: { "1024x1024": 0.211, "1024x1536": 0.165, "1536x1024": 0.165 },
    },
    verifiedAt: "2026-08-11",
    sourceNote: "Official OpenAI gpt-image-2 token pricing + calculator approx per quality/size",
  },
  [MODEL_CATALOG.GOOGLE_VIDEO_ECONOMY.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_VIDEO_ECONOMY.id,
    unit: "video_second",
    pricingDimension: "video_resolution_second",
    source: "google",
    videoSecondCostUsd: 0.05,
    videoByResolutionUsdPerSecond: { "720p": 0.05, "1080p": 0.08 },
    verifiedAt: "2026-08-11",
    sourceNote: "Official Veo 3.1 Lite — resolution-aware $/sec with audio",
  },
  [MODEL_CATALOG.GOOGLE_VIDEO_FAST.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_VIDEO_FAST.id,
    unit: "video_second",
    pricingDimension: "video_resolution_second",
    source: "google",
    videoSecondCostUsd: 0.1,
    videoByResolutionUsdPerSecond: { "720p": 0.1, "1080p": 0.12, "4k": 0.3 },
    verifiedAt: "2026-08-11",
    sourceNote: "Official Veo 3.1 Fast — resolution-aware $/sec with audio",
  },
  [MODEL_CATALOG.GOOGLE_VIDEO_PREMIUM.id]: {
    provider: "google",
    model: MODEL_CATALOG.GOOGLE_VIDEO_PREMIUM.id,
    unit: "video_second",
    pricingDimension: "video_resolution_second",
    source: "google",
    videoSecondCostUsd: 0.4,
    videoByResolutionUsdPerSecond: { "720p": 0.4, "1080p": 0.4, "4k": 0.6 },
    verifiedAt: "2026-08-11",
    sourceNote: "Official Veo 3.1 Standard — 720p/1080p $0.40/sec, 4k $0.60/sec",
  },
  [MODEL_CATALOG.NORMAL_TRANSCRIPTION.id]: {
    provider: "openai",
    model: MODEL_CATALOG.NORMAL_TRANSCRIPTION.id,
    unit: "audio_minute",
    pricingDimension: "audio_minute",
    source: "openai",
    audioUnitCostUsd: 0.003,
    verifiedAt: "2026-08-11",
    sourceNote: "OpenAI transcription estimate",
  },
  [MODEL_CATALOG.NORMAL_TTS.id]: {
    provider: "openai",
    model: MODEL_CATALOG.NORMAL_TTS.id,
    unit: "audio_minute",
    pricingDimension: "audio_minute",
    source: "openai",
    audioUnitCostUsd: 0.015,
    verifiedAt: "2026-08-11",
    sourceNote: "OpenAI TTS estimate",
  },
  [MODEL_CATALOG.PREMIUM_TTS.id]: {
    provider: "openai",
    model: MODEL_CATALOG.PREMIUM_TTS.id,
    unit: "audio_minute",
    pricingDimension: "audio_minute",
    source: "openai",
    audioUnitCostUsd: 0.03,
    verifiedAt: "2026-08-11",
    sourceNote: "OpenAI premium TTS estimate",
  },
};

export function getCostMetadata(model: string): AICostMetadataExtended | undefined {
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

export function estimateImageCostUsd(
  model: string,
  imageCount: number,
  opts?: { resolution?: ImageResolution; quality?: ImageQuality; size?: string },
): number {
  const meta = getCostMetadata(model);
  if (!meta) return 0;

  if (meta.pricingDimension === "image_token" && meta.openaiImageApproxUsd) {
    const quality = opts?.quality ?? "medium";
    const size = opts?.size ?? "1024x1024";
    const per = meta.openaiImageApproxUsd[quality]?.[size] ?? meta.openaiImageApproxUsd.medium?.["1024x1024"] ?? 0.053;
    return roundUsd(per * imageCount);
  }

  if (meta.imageByResolutionUsd) {
    const resolution = opts?.resolution ?? "1K";
    const per = meta.imageByResolutionUsd[resolution] ?? meta.imageUnitCostUsd ?? 0;
    return roundUsd(per * imageCount);
  }

  if (!meta.imageUnitCostUsd) return 0;
  return roundUsd(meta.imageUnitCostUsd * imageCount);
}

/** Token-aware OpenAI image estimate when exact token counts are known. */
export function estimateOpenAIImageTokenCostUsd(args: {
  textInputTokens?: number;
  cachedTextInputTokens?: number;
  imageInputTokens?: number;
  cachedImageInputTokens?: number;
  imageOutputTokens?: number;
}): number {
  const meta = getCostMetadata(MODEL_CATALOG.OPENAI_IMAGE_FALLBACK.id);
  if (!meta) return 0;
  const text =
    ((args.textInputTokens ?? 0) / 1_000_000) * (meta.textInputUsdPerMillion ?? 0) +
    ((args.cachedTextInputTokens ?? 0) / 1_000_000) * (meta.cachedTextInputUsdPerMillion ?? 0);
  const imageIn =
    ((args.imageInputTokens ?? 0) / 1_000_000) * (meta.imageInputUsdPerMillion ?? 0) +
    ((args.cachedImageInputTokens ?? 0) / 1_000_000) * (meta.cachedImageInputUsdPerMillion ?? 0);
  const imageOut = ((args.imageOutputTokens ?? 0) / 1_000_000) * (meta.imageOutputUsdPerMillion ?? 0);
  return roundUsd(text + imageIn + imageOut);
}

export function estimateVideoCostUsd(
  model: string,
  seconds: number,
  opts?: { resolution?: VideoResolution },
): number {
  const meta = getCostMetadata(model);
  if (!meta) return 0;
  const resolution = opts?.resolution ?? "720p";
  const perSec =
    meta.videoByResolutionUsdPerSecond?.[resolution] ??
    meta.videoSecondCostUsd ??
    0;
  return roundUsd(perSec * seconds);
}

/** Conservative Gemini Google Search upper-bound rate: $14 per 1,000 queries. */
export const GEMINI_GOOGLE_SEARCH_USD_PER_1000_QUERIES = 14;

/** Conservative OpenAI Responses web_search estimate per tool call. */
export const OPENAI_WEB_SEARCH_USD_PER_CALL = 0.01;

export function estimateGeminiSearchToolCostUsd(webSearchQueries: number): number {
  const queries = Math.max(0, Math.floor(webSearchQueries));
  return roundUsd((queries / 1000) * GEMINI_GOOGLE_SEARCH_USD_PER_1000_QUERIES);
}

export function estimateOpenAIWebSearchToolCostUsd(webSearchCalls: number): number {
  const calls = Math.max(0, Math.floor(webSearchCalls));
  return roundUsd(calls * OPENAI_WEB_SEARCH_USD_PER_CALL);
}

export function buildUsage(args: {
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  mediaUnits?: number;
  estimatedCostUsd?: number;
  toolUsage?: AIUsage["toolUsage"];
}): AIUsage {
  const inputTokens = args.inputTokens ?? 0;
  const cachedInputTokens = args.cachedInputTokens ?? 0;
  const outputTokens = args.outputTokens ?? 0;
  const tokenCost =
    args.estimatedCostUsd ??
    estimateTokenCostUsd({
      model: args.model,
      inputTokens,
      cachedInputTokens,
      outputTokens,
    });
  const toolCost = args.toolUsage?.estimatedToolCostUsd ?? 0;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    mediaUnits: args.mediaUnits,
    estimatedCostUsd: roundUsd(tokenCost + toolCost),
    toolUsage: args.toolUsage,
  };
}

export function resolveCatalogCostKey(key: ModelCatalogKey): AICostMetadataExtended | undefined {
  return getCostMetadata(resolveModelId(key));
}

export function listCostEntriesForProvider(provider: AIProviderId): AICostMetadataExtended[] {
  return Object.values(COST_CATALOG).filter((c) => c.provider === provider);
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
