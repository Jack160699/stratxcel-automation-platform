/** Domain types for @stratxcel/creative-studio */

export type CreativePlatform =
  | "instagram"
  | "linkedin"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "x"
  | "generic";

export type CreativeFormat =
  | "image"
  | "carousel"
  | "reel"
  | "video"
  | "story"
  | "longform";

export type ConceptArchetype =
  | "educational"
  | "aspirational"
  | "proof-driven"
  | "authority"
  | "transformation"
  | "product-led"
  | "founder-led"
  | "offer-led"
  | "storytelling"
  | "comparison"
  | "local-relevance"
  | "objection-handling";

export type StudioCapabilityOutcome =
  | "OK"
  | "WAITING_CAPABILITY"
  | "FAILED"
  | "REVISION_REQUIRED"
  | "HUMAN_REVIEW"
  | "NEEDS_ATTENTION"
  | "BUDGET_EXCEEDED";

export type CreativeCritiqueDecision =
  | "PASS"
  | "REVISION_REQUIRED"
  | "REJECTED"
  | "HUMAN_REVIEW"
  | "NEEDS_ATTENTION";

export type VideoProductionMode =
  | "generative_video"
  | "customer_assets"
  | "licensed_stock"
  | "stills_with_motion"
  | "template_composition"
  | "broll_assembly"
  | "unavailable";

export type PackageTier = "starter" | "growth" | "business" | "image_30" | "launch";

export interface StudioBudget {
  estimatedCents: number;
  reservedCents: number;
  spentCents: number;
  maxCandidates: number;
}

export interface ReferenceAsset {
  id: string;
  tenantId: string;
  kind:
    | "product_photo"
    | "campaign"
    | "logo"
    | "founder"
    | "location"
    | "packaging"
    | "inspiration"
    | "other";
  uri: string;
  missionId?: string;
  campaignId?: string;
  brandBrainRef?: boolean;
  labels?: readonly string[];
}

export interface CreativeBriefInput {
  tenantId: string;
  missionId: string;
  businessObjective: string;
  audience: string;
  funnelPurpose: string;
  positioning?: string;
  researchSummary?: string;
  approvedClaims?: readonly string[];
  prohibitedClaims?: readonly string[];
  platform: CreativePlatform;
  format: CreativeFormat;
  campaignContext?: string;
  referenceAssetIds?: readonly string[];
  productFacts?: readonly string[];
  brandConstraints?: readonly string[];
  qualityTarget?: string;
}

export interface CreativeBrief {
  id: string;
  tenantId: string;
  missionId: string;
  singleMindedObjective: string;
  audienceInsight: string;
  conceptSeed: string;
  hook: string;
  emotionalDirection: string;
  visualDirection: string;
  copyDirection: string;
  cta: string;
  mustInclude: readonly string[];
  mustAvoid: readonly string[];
  references: readonly string[];
  brandConstraints: readonly string[];
  platformConstraints: readonly string[];
  qualityTarget: string;
  platform: CreativePlatform;
  format: CreativeFormat;
  approvedClaims: readonly string[];
  prohibitedClaims: readonly string[];
  productFacts: readonly string[];
  createdByDepartment: "creative";
  createdByRole: "creative_director";
}

export interface CreativeConcept {
  id: string;
  archetype: ConceptArchetype;
  title: string;
  hook: string;
  narrative: string;
  rationale: string;
  emotionalAngle: string;
  visualAngle: string;
}

export interface PlatformCopy {
  platform: CreativePlatform;
  hook: string;
  headline: string;
  caption: string;
  cta: string;
  overlays: readonly string[];
  description?: string;
}

export interface ScriptArtifact {
  id: string;
  kind: "reel" | "video" | "voiceover";
  platform: CreativePlatform;
  hook: string;
  beats: readonly { timestampHint: string; line: string; visualCue: string }[];
  cta: string;
  durationSeconds: number;
}

export interface LongformEdit {
  id: string;
  title: string;
  body: string;
  wordCount: number;
  editedFor: string;
}

export interface ArtDirectionArtifact {
  id: string;
  visualConcept: string;
  composition: string;
  subject: string;
  environment: string;
  lighting: string;
  lensFeel?: string;
  colorDirection: readonly string[];
  typographyPlan: {
    headlineFont: string;
    bodyFont: string;
    hierarchy: readonly string[];
  };
  logoTreatment: string;
  negativeConstraints: readonly string[];
  productFidelityRequirements: readonly string[];
  humanRealismRequirements: readonly string[];
  referenceAssetIds: readonly string[];
  aspectRatio: string;
  safeArea: string;
  textOverlayPlan: readonly string[];
}

export interface ImageCandidateScores {
  composition: number;
  productFidelity: number;
  anatomy: number;
  brandFit: number;
  lighting: number;
  realism: number;
  visualHierarchy: number;
  textLogoContamination: number;
  unwantedArtifacts: number;
  platformCropSafety: number;
  originality: number;
}

export interface ImageCandidate {
  id: string;
  tenantId: string;
  missionId: string;
  status: "generated" | "evaluated" | "revised" | "selected" | "rejected" | "blocked";
  uri?: string;
  promptRef: string;
  aspectRatio: string;
  candidateGroup: string;
  referenceAssetIds: readonly string[];
  scores?: ImageCandidateScores;
  overallScore?: number;
  revisionNumber: number;
  provider: string;
  model?: string;
  isPhotographyClaim: false;
  fidelityPass?: boolean;
  provenanceId?: string;
}

export interface ImageGenerationResult {
  outcome: StudioCapabilityOutcome;
  candidates: ImageCandidate[];
  reason?: string;
  budgetAfter?: StudioBudget;
}

export interface ProductFidelityResult {
  pass: boolean;
  score: number;
  failures: readonly string[];
  decision: "PASS" | "REVISION_REQUIRED" | "HUMAN_REVIEW";
}

export interface TypographyLayout {
  id: string;
  width: number;
  height: number;
  elements: readonly {
    kind: "text" | "logo" | "cta" | "label" | "frame";
    content: string;
    x: number;
    y: number;
    fontSize?: number;
    fontFamily?: string;
  }[];
  fingerprint: string;
}

export interface CarouselPagePlan {
  index: number;
  role: "hook" | "body" | "proof" | "cta" | "example";
  headline: string;
  body: string;
  visualIntent: string;
}

export interface CarouselPage {
  index: number;
  role: CarouselPagePlan["role"];
  headline: string;
  body: string;
  backgroundRef?: string;
  layoutFingerprint: string;
  distinctKey: string;
}

export interface CarouselArtifact {
  id: string;
  pages: readonly CarouselPage[];
  aspectRatio: string;
  brandSystem: string;
  qaPassed: boolean;
}

export interface StoryboardScene {
  scene: number;
  durationSeconds: number;
  purpose: string;
  visual: string;
  dialogueOrVoiceover: string;
  onScreenText: string;
  assetRequirements: readonly string[];
  transition: string;
  audioCue: string;
  cta?: string;
  sourceMethod: VideoProductionMode;
}

export interface StoryboardArtifact {
  id: string;
  scenes: readonly StoryboardScene[];
  totalDurationSeconds: number;
}

export interface AudioPlan {
  id: string;
  voiceover: { status: "planned" | "WAITING_CAPABILITY" | "unavailable"; scriptRef?: string };
  music: { status: "none" | "licensed_only" | "WAITING_CAPABILITY"; note: string };
  sfx: readonly string[];
  mixingNotes: string;
}

export interface VideoReelArtifact {
  id: string;
  kind: "reel" | "video";
  productionMode: VideoProductionMode;
  storyboardId: string;
  audioPlanId: string;
  uri?: string;
  captions: readonly string[];
  outcome: StudioCapabilityOutcome;
  reason?: string;
}

export interface MediaProvenance {
  id: string;
  tenantId: string;
  missionId: string;
  stageId?: string;
  department: string;
  role: string;
  capability: string;
  provider: string;
  model?: string;
  promptOrBriefRef: string;
  referenceAssetIds: readonly string[];
  candidateGroup?: string;
  parentArtifactId?: string;
  generatedAtIso: string;
  revisionNumber: number;
  finalSelectionReason?: string;
  internalOnly: {
    rawPrompt?: string;
    providerInternals?: Record<string, unknown>;
  };
}

export interface CustomerSafeProvenance {
  id: string;
  tenantId: string;
  missionId: string;
  department: string;
  role: string;
  generatedAtIso: string;
  revisionNumber: number;
  finalSelectionReason?: string;
}

export interface CreativeCritiqueResult {
  decision: CreativeCritiqueDecision;
  strengths: readonly string[];
  weaknesses: readonly string[];
  strategicProblems: readonly string[];
  brandProblems: readonly string[];
  visualProblems: readonly string[];
  copyProblems: readonly string[];
  factualConcerns: readonly string[];
  requiredRevisions: readonly string[];
  scores: readonly { dimension: string; score: number }[];
  overallScore: number;
  reviewerDepartment: string;
  reviewerRole: string;
  creatorDepartment: string;
  creatorRole: string;
}

export interface RevisionState {
  maxRevisions: number;
  revisionCount: number;
  status: "open" | "HUMAN_REVIEW" | "NEEDS_ATTENTION" | "passed";
  lastCritique?: CreativeCritiqueResult;
  history: readonly { cycle: number; decision: CreativeCritiqueDecision; notes: string }[];
}

export interface FinalCreativeArtifact {
  id: string;
  tenantId: string;
  missionId: string;
  mediaAssetId: string;
  mediaUri: string;
  copyVersionId: string;
  copySnapshot: PlatformCopy | ScriptArtifact | { caption: string; cta: string };
  conceptId: string;
  artDirectionId: string;
  provenanceId: string;
  boundAtIso: string;
  bindingFingerprint: string;
  approved: true;
}

export interface PackageCompositionItem {
  mediaType: "image" | "reel" | "carousel" | "video";
  quantity: number;
}

export interface StudioPackageComposition {
  tier: PackageTier;
  items: readonly PackageCompositionItem[];
  totalUnits: number;
}

export interface CreativeBrandContext {
  sliceKeys: readonly string[];
  businessName?: string;
  toneOfVoice?: string;
  targetAudience?: string;
  pillars?: string[];
  rules?: string[];
  products?: { name: string; description: string }[];
  approvedClaims?: readonly string[];
  prohibitedClaims?: readonly string[];
  campaignObjective?: string;
  colorHints?: readonly string[];
}
