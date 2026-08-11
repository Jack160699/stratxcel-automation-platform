/**
 * Social Copilot generate_image capability adapter.
 * Routes through Creative Studio media.image_generation — never fakes success.
 */

import {
  BlockedImageProvider,
  generateImageCandidates,
  getImageProvider,
  resetImageProvider,
  setImageProvider,
  type ImageProvider,
  type ArtDirectionArtifact,
  type CreativeBrief,
  type StudioBudget,
} from "@stratxcel/creative-studio";
import { resolveImageGenerationRuntimeStatus, type CapabilityRuntimeStatus } from "./capability-evidence.ts";

export type GenerateImageOutcome =
  | "OK"
  | "NOT_CONFIGURED"
  | "WAITING_CONFIGURATION"
  | "REVISION_REQUIRED"
  | "BUDGET_EXCEEDED"
  | "FAILED";

export interface GenerateImageRequest {
  tenantId: string;
  missionId: string;
  sessionId: string;
  briefText: string;
  brandBrainVersion?: number | null;
  referenceMediaAssetIds?: readonly string[];
  candidateCount?: number;
  budget?: StudioBudget;
  /** Test-only injected provider — never used in production paths. */
  testProvider?: ImageProvider | null;
}

export interface GeneratedImageCandidate {
  candidateId: string;
  uri: string;
  provider: string;
  model: string | null;
  width?: number | null;
  height?: number | null;
  format?: string | null;
}

export interface GenerateImageResult {
  outcome: GenerateImageOutcome;
  runtimeStatus: CapabilityRuntimeStatus;
  candidates: GeneratedImageCandidate[];
  selectedCandidateId: string | null;
  reason?: string;
  provenance: {
    tenantId: string;
    missionId: string;
    sessionId: string;
    provider: string | null;
    model: string | null;
    generatedAtIso: string;
    brandBrainVersion: number | null;
    referenceMediaAssetIds: string[];
  };
}

function minimalBrief(input: GenerateImageRequest): CreativeBrief {
  const text = input.briefText.slice(0, 500);
  return {
    id: `brief_${input.missionId}`,
    tenantId: input.tenantId,
    missionId: input.missionId,
    singleMindedObjective: text,
    audienceInsight: "brand audience",
    conceptSeed: text,
    hook: text.slice(0, 120),
    emotionalDirection: "confident",
    visualDirection: "clean product/brand visual",
    copyDirection: "minimal overlay",
    cta: "Learn more",
    mustInclude: [],
    mustAvoid: [],
    references: [...(input.referenceMediaAssetIds ?? [])],
    brandConstraints: [],
    platformConstraints: [],
    qualityTarget: "release_ready",
    platform: "instagram",
    format: "image",
    approvedClaims: [],
    prohibitedClaims: [],
    productFacts: [],
    createdByDepartment: "creative",
    createdByRole: "creative_director",
  };
}

function minimalArt(input: GenerateImageRequest): ArtDirectionArtifact {
  return {
    id: `art_${input.missionId}`,
    visualConcept: input.briefText.slice(0, 200),
    composition: "centered subject with clear hierarchy",
    subject: "brand subject",
    environment: "clean brand environment",
    lighting: "natural soft light",
    colorDirection: ["brand primary"],
    typographyPlan: {
      headlineFont: "brand",
      bodyFont: "brand",
      hierarchy: ["headline", "body"],
    },
    logoTreatment: "subtle corner",
    negativeConstraints: ["no fake photography claims"],
    productFidelityRequirements: [],
    humanRealismRequirements: [],
    referenceAssetIds: [...(input.referenceMediaAssetIds ?? [])],
    aspectRatio: "1:1",
    safeArea: "standard",
    textOverlayPlan: [],
  };
}

/**
 * Request image generation via capability runtime.
 * Without a real/configured provider: NOT_CONFIGURED / WAITING_CONFIGURATION and zero assets.
 */
export async function requestGenerateImage(input: GenerateImageRequest): Promise<GenerateImageResult> {
  const generatedAtIso = new Date().toISOString();
  const provenanceBase = {
    tenantId: input.tenantId,
    missionId: input.missionId,
    sessionId: input.sessionId,
    brandBrainVersion: input.brandBrainVersion ?? null,
    referenceMediaAssetIds: [...(input.referenceMediaAssetIds ?? [])],
    generatedAtIso,
  };

  const previous = getImageProvider();
  let injectedTest = false;
  try {
    if (input.testProvider) {
      setImageProvider(input.testProvider);
      injectedTest = true;
    }

    const provider = getImageProvider();
    const runtimeStatus = resolveImageGenerationRuntimeStatus({
      providerConfigured: Boolean(provider) && !(provider instanceof BlockedImageProvider),
      testProviderInjected: injectedTest,
    });

    if (!provider || provider instanceof BlockedImageProvider || runtimeStatus === "NOT_CONFIGURED") {
      return {
        outcome: "NOT_CONFIGURED",
        runtimeStatus: "NOT_CONFIGURED",
        candidates: [],
        selectedCandidateId: null,
        reason: "media.image_generation_NOT_CONFIGURED",
        provenance: { ...provenanceBase, provider: null, model: null },
      };
    }

    const result = await generateImageCandidates({
      brief: minimalBrief(input),
      artDirection: minimalArt(input),
      explicitReferenceIds: [...(input.referenceMediaAssetIds ?? [])],
      candidateCount: input.candidateCount ?? 2,
      budget: input.budget,
    });

    if (result.outcome === "WAITING_CAPABILITY") {
      return {
        outcome: "WAITING_CONFIGURATION",
        runtimeStatus: "WAITING_CONFIGURATION",
        candidates: [],
        selectedCandidateId: null,
        reason: result.reason ?? "WAITING_CAPABILITY",
        provenance: { ...provenanceBase, provider: provider.name, model: null },
      };
    }

    if (result.outcome === "BUDGET_EXCEEDED") {
      return {
        outcome: "BUDGET_EXCEEDED",
        runtimeStatus: "OPERATIONAL",
        candidates: [],
        selectedCandidateId: null,
        reason: result.reason,
        provenance: { ...provenanceBase, provider: provider.name, model: null },
      };
    }

    const candidates: GeneratedImageCandidate[] = (result.candidates ?? []).map((c) => ({
      candidateId: c.id,
      uri: c.uri ?? `candidate://${c.id}`,
      provider: c.provider ?? provider.name,
      model: c.model ?? null,
      width: null,
      height: null,
      format: null,
    }));

    // V1: do not auto-select the first candidate as final READY media.
    if (candidates.length === 0) {
      return {
        outcome: "REVISION_REQUIRED",
        runtimeStatus: "OPERATIONAL",
        candidates: [],
        selectedCandidateId: null,
        reason: "no_candidates",
        provenance: { ...provenanceBase, provider: provider.name, model: null },
      };
    }

    return {
      outcome: "REVISION_REQUIRED",
      runtimeStatus: "OPERATIONAL",
      candidates,
      selectedCandidateId: null,
      reason: "candidate_selection_required",
      provenance: {
        ...provenanceBase,
        provider: candidates[0]?.provider ?? provider.name,
        model: candidates[0]?.model ?? null,
      },
    };
  } finally {
    if (injectedTest) {
      if (previous) setImageProvider(previous);
      else resetImageProvider();
    }
  }
}

/** Persist contract for a selected candidate → social_media_assets (caller performs storage). */
export interface GeneratedMediaAssetProvenance {
  tenantId: string;
  missionId: string;
  sessionId: string;
  artifactId?: string | null;
  provider: string;
  model: string | null;
  generatedAtIso: string;
  creativeBriefRef: string;
  revision: number;
  width?: number | null;
  height?: number | null;
  format?: string | null;
  source: "generate_image";
}
