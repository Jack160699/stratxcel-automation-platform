import { assertClaimsAllowed } from "../brief/creative-director.ts";
import type {
  CreativeBrief,
  CreativeConcept,
  CreativePlatform,
  LongformEdit,
  PlatformCopy,
  ScriptArtifact,
} from "../types.ts";

const PLATFORM_LIMITS: Record<CreativePlatform, { captionMax: number; hookStyle: string }> = {
  instagram: { captionMax: 2200, hookStyle: "visual-first" },
  linkedin: { captionMax: 3000, hookStyle: "professional" },
  facebook: { captionMax: 2000, hookStyle: "conversational" },
  youtube: { captionMax: 5000, hookStyle: "discovery" },
  tiktok: { captionMax: 2200, hookStyle: "punchy" },
  x: { captionMax: 280, hookStyle: "concise" },
  generic: { captionMax: 2000, hookStyle: "neutral" },
};

function claimGate(brief: CreativeBrief, text: string): void {
  assertClaimsAllowed({
    text,
    approvedClaims: brief.approvedClaims,
    prohibitedClaims: brief.prohibitedClaims,
  });
}

export function writePlatformCopy(args: {
  brief: CreativeBrief;
  concept: CreativeConcept;
  platform?: CreativePlatform;
}): PlatformCopy {
  const platform = args.platform ?? args.brief.platform;
  const limits = PLATFORM_LIMITS[platform];
  const headline = `${args.concept.title}: ${args.brief.singleMindedObjective}`.slice(0, 120);
  const hook = args.concept.hook.slice(0, platform === "x" ? 100 : 160);
  const caption = [
    hook,
    "",
    args.concept.narrative,
    "",
    args.brief.mustInclude.slice(0, 2).join(" · "),
    "",
    `#${args.concept.archetype.replace(/-/g, "")}`,
  ]
    .join("\n")
    .slice(0, limits.captionMax);

  claimGate(args.brief, `${headline}\n${caption}\n${args.brief.cta}`);

  return {
    platform,
    hook,
    headline,
    caption,
    cta: args.brief.cta,
    overlays: [args.concept.title, args.brief.cta].filter(Boolean),
    description: `${limits.hookStyle} adaptation for ${platform}`,
  };
}

export function adaptCopyAcrossPlatforms(args: {
  brief: CreativeBrief;
  concept: CreativeConcept;
  platforms: readonly CreativePlatform[];
}): PlatformCopy[] {
  const adapted = args.platforms.map((platform) =>
    writePlatformCopy({ brief: args.brief, concept: args.concept, platform }),
  );
  assertPlatformAdaptation(adapted);
  return adapted;
}

export function assertPlatformAdaptation(copies: readonly PlatformCopy[]): void {
  if (copies.length < 2) throw new Error("platform_adaptation_requires_multiple_platforms");
  const platforms = new Set(copies.map((c) => c.platform));
  if (platforms.size !== copies.length) throw new Error("platform_adaptation_must_be_distinct");
  const captions = new Set(copies.map((c) => c.caption));
  if (captions.size < 2) throw new Error("platform_adaptation_captions_must_differ");
}

export function writeScript(args: {
  brief: CreativeBrief;
  concept: CreativeConcept;
  kind?: ScriptArtifact["kind"];
  durationSeconds?: number;
}): ScriptArtifact {
  const durationSeconds = args.durationSeconds ?? (args.brief.format === "reel" ? 30 : 60);
  const beats = [
    { timestampHint: "0-3s", line: args.concept.hook, visualCue: "pattern interrupt / product reveal" },
    { timestampHint: "3-12s", line: args.concept.narrative, visualCue: args.concept.visualAngle },
    {
      timestampHint: "12-20s",
      line: args.brief.mustInclude[0] ?? args.brief.singleMindedObjective,
      visualCue: "proof or demo beat",
    },
    {
      timestampHint: `${Math.max(20, durationSeconds - 5)}-${durationSeconds}s`,
      line: args.brief.cta,
      visualCue: "end card / CTA overlay",
    },
  ];
  claimGate(args.brief, beats.map((b) => b.line).join("\n"));
  return {
    id: `script_${args.brief.id}_${args.concept.id}`,
    kind: args.kind ?? (args.brief.format === "reel" ? "reel" : "video"),
    platform: args.brief.platform,
    hook: args.concept.hook,
    beats,
    cta: args.brief.cta,
    durationSeconds,
  };
}

export function editLongform(args: {
  brief: CreativeBrief;
  title: string;
  draft: string;
  editedFor?: string;
}): LongformEdit {
  const cleaned = args.draft.replace(/\s+/g, " ").trim().replace(/\bguaranteed ROI\b/gi, "measurable outcomes");
  claimGate(args.brief, `${args.title}\n${cleaned}`);
  const words = cleaned.split(/\s+/).filter(Boolean);
  return {
    id: `longform_${args.brief.id}_${Date.now().toString(36)}`,
    title: args.title,
    body: cleaned,
    wordCount: words.length,
    editedFor: args.editedFor ?? args.brief.platform,
  };
}
