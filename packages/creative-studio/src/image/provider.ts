import type {
  ArtDirectionArtifact,
  CreativeBrief,
  ImageCandidate,
  ImageGenerationResult,
  ReferenceAsset,
  StudioBudget,
} from "../types.ts";
export interface ImageProvider {
  readonly name: string;
  generate(args: {
    brief: CreativeBrief;
    artDirection: ArtDirectionArtifact;
    referenceAssetIds: readonly string[];
    candidateCount: number;
    budget: StudioBudget;
  }): Promise<ImageGenerationResult>;
}

export class BlockedImageProvider implements ImageProvider {
  readonly name = "blocked";
  async generate(): Promise<ImageGenerationResult> {
    return {
      outcome: "WAITING_CAPABILITY",
      candidates: [],
      reason: "image_generation_capability_unavailable",
    };
  }
}

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  async generate(args: {
    brief: CreativeBrief;
    artDirection: ArtDirectionArtifact;
    referenceAssetIds: readonly string[];
    candidateCount: number;
    budget: StudioBudget;
  }): Promise<ImageGenerationResult> {
    assertBudgetAllows(args.budget, args.candidateCount);
    const count = Math.min(args.candidateCount, args.budget.maxCandidates);
    const candidates: ImageCandidate[] = Array.from({ length: count }, (_, i) => ({
      id: `img_${args.brief.missionId}_${i}_${Date.now().toString(36)}`,
      tenantId: args.brief.tenantId,
      missionId: args.brief.missionId,
      status: "generated",
      uri: `mock://image/${args.brief.missionId}/${i}`,
      promptRef: args.artDirection.id,
      aspectRatio: args.artDirection.aspectRatio,
      candidateGroup: `group_${args.brief.missionId}`,
      referenceAssetIds: [...args.referenceAssetIds],
      revisionNumber: 0,
      provider: this.name,
      model: "mock-v1",
      isPhotographyClaim: false,
    }));
    const spent = args.budget.spentCents + count * 25;
    return {
      outcome: "OK",
      candidates,
      budgetAfter: {
        ...args.budget,
        spentCents: spent,
        reservedCents: Math.max(0, args.budget.reservedCents - count * 25),
      },
    };
  }
}

let activeProvider: ImageProvider | null = null;

export function setImageProvider(provider: ImageProvider | null): void {
  activeProvider = provider;
}

export function getImageProvider(): ImageProvider | null {
  return activeProvider;
}

export function resetImageProvider(): void {
  activeProvider = null;
}

export function createStudioBudget(partial?: Partial<StudioBudget>): StudioBudget {
  return {
    estimatedCents: partial?.estimatedCents ?? 500,
    reservedCents: partial?.reservedCents ?? 500,
    spentCents: partial?.spentCents ?? 0,
    maxCandidates: partial?.maxCandidates ?? 4,
  };
}

export function assertBudgetAllows(budget: StudioBudget, candidateCount: number): void {
  if (candidateCount > budget.maxCandidates) {
    throw new Error("BUDGET_EXCEEDED:max_candidates");
  }
  const projected = budget.spentCents + candidateCount * 25;
  if (projected > budget.estimatedCents && projected > budget.reservedCents + budget.spentCents) {
    throw new Error("BUDGET_EXCEEDED:spend_cap");
  }
}

/**
 * When no provider is configured, returns WAITING_CAPABILITY with zero candidates
 * (never invents fake image URIs). Only passes explicitIds that exist in the library.
 */
export async function generateImageCandidates(args: {
  brief: CreativeBrief;
  artDirection: ArtDirectionArtifact;
  referenceAssets?: readonly ReferenceAsset[];
  explicitReferenceIds?: readonly string[];
  candidateCount?: number;
  budget?: StudioBudget;
}): Promise<ImageGenerationResult> {
  const budget = args.budget ?? createStudioBudget();
  const candidateCount = args.candidateCount ?? 2;

  try {
    assertBudgetAllows(budget, candidateCount);
  } catch (err) {
    return {
      outcome: "BUDGET_EXCEEDED",
      candidates: [],
      reason: err instanceof Error ? err.message : "BUDGET_EXCEEDED",
      budgetAfter: budget,
    };
  }

  const library = args.referenceAssets ?? [];
  // Image generation only forwards explicit IDs that exist in the library (no unrelated auto-select).
  if (library.length > 0) {
    for (const asset of library) {
      if (asset.tenantId !== args.brief.tenantId) {
        throw new Error(`cross_tenant_reference_forbidden:${asset.id}`);
      }
    }
  }
  const referenceAssetIds = (args.explicitReferenceIds ?? args.artDirection.referenceAssetIds ?? []).filter(
    (id) => library.some((asset) => asset.id === id),
  );
  const provider = activeProvider;
  if (!provider) {
    return {
      outcome: "WAITING_CAPABILITY",
      candidates: [],
      reason: "image_provider_not_configured",
      budgetAfter: budget,
    };
  }

  return provider.generate({
    brief: args.brief,
    artDirection: args.artDirection,
    referenceAssetIds,
    candidateCount,
    budget,
  });
}
