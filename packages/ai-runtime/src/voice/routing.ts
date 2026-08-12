import { resolveModelId } from "../catalog/models.ts";

export type VoiceWorkload = "realtime_voice" | "realtime_transcription" | "transcription" | "tts" | "premium_tts";

export interface VoiceRoute {
  primaryProvider: "openai" | "google";
  primaryModel: string;
  fallbackProvider: "openai" | "google" | null;
  fallbackModel: string | null;
  deprecated: boolean;
}

export function routeVoiceWorkload(workload: VoiceWorkload, env: NodeJS.ProcessEnv = process.env): VoiceRoute {
  switch (workload) {
    case "realtime_voice":
      return {
        primaryProvider: "openai",
        primaryModel: resolveModelId("REALTIME_VOICE_PRIMARY", env),
        fallbackProvider: "google",
        fallbackModel: resolveModelId("REALTIME_VOICE_GOOGLE_FALLBACK", env),
        deprecated: false,
      };
    case "realtime_transcription":
      return {
        primaryProvider: "openai",
        primaryModel: resolveModelId("REALTIME_TRANSCRIPTION", env),
        fallbackProvider: null,
        fallbackModel: null,
        deprecated: false,
      };
    case "transcription":
      return {
        primaryProvider: "openai",
        primaryModel: resolveModelId("NORMAL_TRANSCRIPTION", env),
        fallbackProvider: null,
        fallbackModel: null,
        deprecated: false,
      };
    case "tts":
      return {
        primaryProvider: "openai",
        primaryModel: resolveModelId("NORMAL_TTS", env),
        fallbackProvider: "google",
        fallbackModel: resolveModelId("GOOGLE_TTS_FALLBACK", env),
        deprecated: false,
      };
    case "premium_tts":
      return {
        primaryProvider: "openai",
        primaryModel: resolveModelId("PREMIUM_TTS", env),
        fallbackProvider: "google",
        fallbackModel: resolveModelId("GOOGLE_TTS_FALLBACK", env),
        deprecated: false,
      };
    default:
      return {
        primaryProvider: "openai",
        primaryModel: resolveModelId("NORMAL_TRANSCRIPTION", env),
        fallbackProvider: null,
        fallbackModel: null,
        deprecated: false,
      };
  }
}

export function isDeprecatedTtsModel(model: string): boolean {
  return /gpt-4o-mini-tts/i.test(model);
}

export function assertVoiceRouteSafe(route: VoiceRoute): void {
  for (const model of [route.primaryModel, route.fallbackModel]) {
    if (model && isDeprecatedTtsModel(model)) {
      throw new Error(`deprecated_tts_model:${model}`);
    }
  }
}
