import type {
  AudioPlan,
  CreativeBrief,
  ScriptArtifact,
  StoryboardArtifact,
  StoryboardScene,
  VideoProductionMode,
  VideoReelArtifact,
} from "../types.ts";

export type VideoProviderStatus = "available" | "unavailable" | "WAITING_CAPABILITY";

let videoProviderStatus: VideoProviderStatus = "unavailable";

export function setVideoProviderStatus(status: VideoProviderStatus): void {
  videoProviderStatus = status;
}

export function getVideoProviderStatus(): VideoProviderStatus {
  return videoProviderStatus;
}

export function resetVideoProviderStatus(): void {
  videoProviderStatus = "unavailable";
}

export function createStoryboard(args: {
  brief: CreativeBrief;
  script: ScriptArtifact;
  preferredMode?: VideoProductionMode;
}): StoryboardArtifact {
  const mode: VideoProductionMode =
    args.preferredMode ??
    (videoProviderStatus === "available" ? "generative_video" : "stills_with_motion");

  const scenes: StoryboardScene[] = args.script.beats.map((beat, index) => ({
    scene: index + 1,
    durationSeconds: Math.max(3, Math.round(args.script.durationSeconds / args.script.beats.length)),
    purpose: index === 0 ? "hook" : index === args.script.beats.length - 1 ? "cta" : "body",
    visual: beat.visualCue,
    dialogueOrVoiceover: beat.line,
    onScreenText: index === 0 ? args.script.hook.slice(0, 60) : beat.line.slice(0, 48),
    assetRequirements: ["brand-safe visuals", "caption-safe framing"],
    transition: index === args.script.beats.length - 1 ? "hold" : "cut",
    audioCue: index === 0 ? "music swell" : "continue bed",
    cta: index === args.script.beats.length - 1 ? args.script.cta : undefined,
    sourceMethod: mode,
  }));

  return {
    id: `storyboard_${args.script.id}`,
    scenes,
    totalDurationSeconds: scenes.reduce((sum, s) => sum + s.durationSeconds, 0),
  };
}

export function createAudioPlan(args: {
  script: ScriptArtifact;
  musicLicensed?: boolean;
}): AudioPlan {
  const voiceAvailable = videoProviderStatus === "available";
  return {
    id: `audio_${args.script.id}`,
    voiceover: voiceAvailable
      ? { status: "planned", scriptRef: args.script.id }
      : { status: "WAITING_CAPABILITY", scriptRef: args.script.id },
    music: args.musicLicensed
      ? { status: "licensed_only", note: "Use licensed catalog only" }
      : { status: "WAITING_CAPABILITY", note: "Music bed requires licensed source or capability" },
    sfx: ["soft whoosh on cut", "click on CTA"],
    mixingNotes: "Voiceover primary; music -12dB under dialogue; duck on CTA",
  };
}

export function produceVideoOrReel(args: {
  brief: CreativeBrief;
  storyboard: StoryboardArtifact;
  audioPlan: AudioPlan;
  kind?: "reel" | "video";
  fallbackMode?: VideoProductionMode;
}): VideoReelArtifact {
  const kind = args.kind ?? (args.brief.format === "reel" ? "reel" : "video");
  const status = videoProviderStatus;

  if (status === "unavailable" || status === "WAITING_CAPABILITY") {
    const fallback: VideoProductionMode =
      args.fallbackMode ?? (status === "unavailable" ? "unavailable" : "stills_with_motion");
    return {
      id: `video_${args.storyboard.id}`,
      kind,
      productionMode: fallback === "generative_video" ? "unavailable" : fallback,
      storyboardId: args.storyboard.id,
      audioPlanId: args.audioPlan.id,
      captions: args.storyboard.scenes.map((s) => s.onScreenText),
      outcome: "WAITING_CAPABILITY",
      reason: status === "unavailable" ? "video_provider_unavailable" : "video_capability_waiting",
    };
  }

  return {
    id: `video_${args.storyboard.id}_ok`,
    kind,
    productionMode: "generative_video",
    storyboardId: args.storyboard.id,
    audioPlanId: args.audioPlan.id,
    uri: `mock://video/${args.brief.missionId}`,
    captions: args.storyboard.scenes.map((s) => s.onScreenText),
    outcome: "OK",
  };
}
