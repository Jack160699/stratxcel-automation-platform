import type { BrandBrainContent } from "@stratxcel/brand-brain";
import { createArtDirection } from "../art/art-direction.ts";
import { compileCreativeBrandContext, toCreativeDirectorBrand } from "../brand/context.ts";
import { createCreativeBrief } from "../brief/creative-director.ts";
import { composeCarousel, planCarouselPages } from "../carousel/pipeline.ts";
import { developConcepts, selectConceptByRationale } from "../concepts/concept-developer.ts";
import { writePlatformCopy, writeScript } from "../copy/copywriter.ts";
import { critiqueCreativeWork, createCreativeRevisionLoop } from "../critique/creative-critic.ts";
import { evaluateProductFidelity } from "../image/fidelity.ts";
import {
  createStudioBudget,
  generateImageCandidates,
  setImageProvider,
  type ImageProvider,
} from "../image/provider.ts";
import { applyImageEvaluation } from "../image/quality.ts";
import { createMediaProvenance } from "../provenance/media-provenance.ts";
import { applyRevisionCycle, createRevisionState, reviseFailingImageCandidate } from "../revision/loop.ts";
import { selectBestImageCandidate } from "../selection/best-candidate.ts";
import { bindFinalCreativeArtifact } from "../binding/final-artifact.ts";
import { createAudioPlan, createStoryboard, produceVideoOrReel } from "../video/pipeline.ts";
import type {
  CreativeBriefInput,
  CreativeFormat,
  FinalCreativeArtifact,
  ImageCandidate,
  ReferenceAsset,
  StudioBudget,
  StudioCapabilityOutcome,
} from "../types.ts";

export interface RunCreativeStudioPipelineInput {
  briefInput: CreativeBriefInput;
  brandBrain?: BrandBrainContent;
  referenceAssets?: readonly ReferenceAsset[];
  imageProvider?: ImageProvider | null;
  budget?: StudioBudget;
  preferConceptArchetype?: Parameters<typeof selectConceptByRationale>[1];
}

export interface CreativeStudioPipelineResult {
  outcome: StudioCapabilityOutcome;
  briefId: string;
  conceptId: string;
  artDirectionId: string;
  imageOutcome: StudioCapabilityOutcome;
  videoOutcome?: StudioCapabilityOutcome;
  carouselId?: string;
  selectedCandidateId?: string;
  finalArtifact?: FinalCreativeArtifact;
  critiqueDecision?: string;
  revisionStatus?: string;
  reason?: string;
}

export async function runCreativeStudioPipeline(
  input: RunCreativeStudioPipelineInput,
): Promise<CreativeStudioPipelineResult> {
  const brandCtx = input.brandBrain
    ? toCreativeDirectorBrand(input.brandBrain)
    : compileCreativeBrandContext({
        department: "creative",
        role: "creative_director",
        brandBrain: {},
      });

  const briefInput: CreativeBriefInput = {
    ...input.briefInput,
    approvedClaims: input.briefInput.approvedClaims ?? brandCtx.approvedClaims,
    prohibitedClaims: input.briefInput.prohibitedClaims ?? brandCtx.prohibitedClaims,
    audience: input.briefInput.audience || brandCtx.targetAudience || "target audience",
    brandConstraints: [...(input.briefInput.brandConstraints ?? []), ...(brandCtx.rules ?? [])],
  };

  const brief = createCreativeBrief(briefInput);
  const concepts = developConcepts(brief);
  const concept = selectConceptByRationale(concepts, input.preferConceptArchetype);
  const artDirection = createArtDirection({
    brief,
    concept,
    referenceAssetIds: brief.references,
  });
  const copy = writePlatformCopy({ brief, concept });

  const loop = createCreativeRevisionLoop({
    creatorDepartment: brief.createdByDepartment,
    creatorRole: brief.createdByRole,
    criticDepartment: "quality",
    criticRole: "creative_critic",
  });

  const critique = critiqueCreativeWork({
    brief,
    content: `${copy.headline}\n${copy.caption}\n${copy.cta}`,
    creatorDepartment: loop.creatorDepartment,
    creatorRole: loop.creatorRole,
    criticDepartment: loop.criticDepartment,
    criticRole: loop.criticRole,
  });

  let revision = applyRevisionCycle(createRevisionState(3), critique);
  if (critique.decision === "REJECTED") {
    return {
      outcome: "NEEDS_ATTENTION",
      briefId: brief.id,
      conceptId: concept.id,
      artDirectionId: artDirection.id,
      imageOutcome: "FAILED",
      critiqueDecision: critique.decision,
      revisionStatus: revision.status,
      reason: "blocked_claims",
    };
  }

  const budget = input.budget ?? createStudioBudget();
  if (input.imageProvider !== undefined) {
    setImageProvider(input.imageProvider);
  }

  const imageResult = await generateImageCandidates({
    brief,
    artDirection,
    referenceAssets: input.referenceAssets,
    explicitReferenceIds: brief.references,
    candidateCount: 2,
    budget,
  });

  if (imageResult.outcome === "WAITING_CAPABILITY") {
    let carouselId: string | undefined;
    let videoOutcome: StudioCapabilityOutcome | undefined;

    if (brief.format === "carousel") {
      const plans = planCarouselPages({ brief, concept });
      carouselId = composeCarousel({ brief, plans }).id;
    }

    if (brief.format === "reel" || brief.format === "video") {
      const script = writeScript({ brief, concept });
      const storyboard = createStoryboard({ brief, script });
      const audio = createAudioPlan({ script });
      videoOutcome = produceVideoOrReel({ brief, storyboard, audioPlan: audio }).outcome;
    }

    return {
      outcome: "WAITING_CAPABILITY",
      briefId: brief.id,
      conceptId: concept.id,
      artDirectionId: artDirection.id,
      imageOutcome: "WAITING_CAPABILITY",
      videoOutcome,
      carouselId,
      critiqueDecision: critique.decision,
      revisionStatus: revision.status,
      reason: imageResult.reason,
    };
  }

  let candidates: ImageCandidate[] = imageResult.candidates.map((c) => applyImageEvaluation(c));
  candidates = candidates.map((c) => {
    const fidelity = evaluateProductFidelity({ candidate: c });
    if (!fidelity.pass) {
      const revised = reviseFailingImageCandidate(c);
      revision = applyRevisionCycle(revision, {
        ...critique,
        decision: "REVISION_REQUIRED",
        requiredRevisions: [...fidelity.failures],
        weaknesses: [...fidelity.failures],
      });
      const recheck = evaluateProductFidelity({ candidate: revised });
      return { ...revised, fidelityPass: recheck.pass };
    }
    return { ...c, fidelityPass: true };
  });

  const best = selectBestImageCandidate(candidates);
  if (!best || best.fidelityPass === false || !best.uri) {
    return {
      outcome: "REVISION_REQUIRED",
      briefId: brief.id,
      conceptId: concept.id,
      artDirectionId: artDirection.id,
      imageOutcome: "REVISION_REQUIRED",
      critiqueDecision: critique.decision,
      revisionStatus: revision.status,
      reason: "product_fidelity_blocked_final",
    };
  }

  const provenance = createMediaProvenance({
    tenantId: brief.tenantId,
    missionId: brief.missionId,
    department: "media",
    role: "image_producer",
    capability: "media.image_generate",
    provider: best.provider,
    model: best.model,
    promptOrBriefRef: artDirection.id,
    referenceAssetIds: best.referenceAssetIds,
    candidateGroup: best.candidateGroup,
    revisionNumber: best.revisionNumber,
    finalSelectionReason: "weighted_best_candidate",
  });

  const finalArtifact = bindFinalCreativeArtifact({
    tenantId: brief.tenantId,
    missionId: brief.missionId,
    mediaAssetId: best.id,
    mediaUri: best.uri,
    copyVersionId: `copy_${brief.id}`,
    copySnapshot: copy,
    concept,
    artDirection,
    provenance,
  });

  let videoOutcome: StudioCapabilityOutcome | undefined;
  let carouselId: string | undefined;

  if (isMotionFormat(brief.format)) {
    const script = writeScript({ brief, concept });
    const storyboard = createStoryboard({ brief, script });
    const audio = createAudioPlan({ script });
    videoOutcome = produceVideoOrReel({ brief, storyboard, audioPlan: audio }).outcome;
  }

  if (brief.format === "carousel") {
    carouselId = composeCarousel({ brief, plans: planCarouselPages({ brief, concept }) }).id;
  }

  return {
    outcome: "OK",
    briefId: brief.id,
    conceptId: concept.id,
    artDirectionId: artDirection.id,
    imageOutcome: "OK",
    videoOutcome,
    carouselId,
    selectedCandidateId: best.id,
    finalArtifact,
    critiqueDecision: critique.decision,
    revisionStatus: "passed",
  };
}

function isMotionFormat(format: CreativeFormat): boolean {
  return format === "reel" || format === "video";
}
