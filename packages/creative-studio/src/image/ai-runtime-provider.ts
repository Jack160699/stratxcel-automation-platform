import type { ImageProvider } from "./provider.ts";
import type { ImageGenerationResult, CreativeBrief, ArtDirectionArtifact, StudioBudget } from "../types.ts";
import { assertBudgetAllows } from "./provider.ts";

/**
 * Optional bridge to @stratxcel/ai-runtime ImageMediaRuntime.
 * Loaded lazily so creative-studio does not hard-require ai-runtime at import time in all environments.
 */
export class AiRuntimeImageProvider implements ImageProvider {
  readonly name = "ai-runtime-image";

  async generate(args: {
    brief: CreativeBrief;
    artDirection: ArtDirectionArtifact;
    referenceAssetIds: readonly string[];
    candidateCount: number;
    budget: StudioBudget;
    tier?: "fast" | "standard" | "premium";
    /** Optional pre-resolved reference bytes (tenant-verified). */
    referenceImages?: Array<{ mimeType: string; data: string }>;
    storage?: import("@stratxcel/ai-runtime").CanonicalMediaStorage;
    persistCanonical?: boolean;
  }): Promise<ImageGenerationResult> {
    assertBudgetAllows(args.budget, args.candidateCount);

    const mod = await import("@stratxcel/ai-runtime");
    const runtime = new mod.ImageMediaRuntime({
      storage: args.storage,
      requireStorageForOperational: Boolean(args.storage) || Boolean(args.persistCanonical),
    });
    if (!runtime.isConfigured()) {
      return {
        outcome: "WAITING_CAPABILITY",
        candidates: [],
        reason: "image_provider_not_configured",
        budgetAfter: args.budget,
      };
    }

    if (args.persistCanonical || args.storage) {
      const storageReady = await runtime.isStorageReady();
      if (!storageReady) {
        return {
          outcome: "WAITING_CAPABILITY",
          candidates: [],
          reason: "image_storage_not_ready",
          budgetAfter: args.budget,
        };
      }
    }

    const result = await runtime.generate({
      tenantId: args.brief.tenantId,
      missionId: args.brief.missionId,
      prompt: `${args.brief.singleMindedObjective}\n${args.brief.visualDirection}\n${args.brief.hook}`,
      aspectRatio: args.artDirection.aspectRatio,
      candidateCount: args.candidateCount,
      tier: args.tier ?? "standard",
      referenceAssetIds: args.referenceAssetIds,
      referenceImages: args.referenceImages,
      persistCanonical: args.persistCanonical ?? Boolean(args.storage),
    });

    if (result.outcome !== "OK" || result.candidates.length === 0) {
      return {
        outcome:
          result.outcome === "NOT_CONFIGURED" || result.outcome === "WAITING_CONFIGURATION"
            ? "WAITING_CAPABILITY"
            : "WAITING_CAPABILITY",
        candidates: [],
        reason: result.reason ?? result.outcome,
        budgetAfter: args.budget,
      };
    }

    const spent = args.budget.spentCents + result.candidates.length * 25;
    return {
      outcome: "OK",
      candidates: result.candidates.map((c) => ({
        id: c.id,
        tenantId: args.brief.tenantId,
        missionId: args.brief.missionId,
        status: "generated" as const,
        uri: c.uri,
        promptRef: args.artDirection.id,
        aspectRatio: args.artDirection.aspectRatio,
        candidateGroup: `group_${args.brief.missionId}`,
        referenceAssetIds: [...args.referenceAssetIds],
        revisionNumber: 0,
        provider: c.provider,
        model: c.model,
        isPhotographyClaim: false,
      })),
      budgetAfter: {
        ...args.budget,
        spentCents: spent,
        reservedCents: Math.max(0, args.budget.reservedCents - result.candidates.length * 25),
      },
    };
  }
}

/** Prefer real AI Runtime image provider when keys exist; else leave unset (NOT_CONFIGURED). */
export function bootstrapAiRuntimeImageProviderIfConfigured(
  setProvider: (p: ImageProvider | null) => void,
): boolean {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    setProvider(null);
    return false;
  }
  setProvider(new AiRuntimeImageProvider());
  return true;
}
