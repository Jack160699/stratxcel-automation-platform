import { ImageMediaRuntime, type ImageGenerateRequest, type ImageTier } from "../media/image.ts";
import type { CanonicalMediaStorage } from "../media/canonical-storage.ts";

/**
 * Creative Studio ImageProvider-compatible adapter.
 * Only returns OK with real candidates — never fabricates assets.
 */
export interface CreativeStudioImageBridgeArgs {
  brief: {
    tenantId: string;
    missionId: string;
    singleMindedObjective: string;
    visualDirection: string;
    hook: string;
  };
  artDirection: {
    aspectRatio: string;
    id: string;
  };
  referenceAssetIds: readonly string[];
  referenceImages?: Array<{ mimeType: string; data: string }>;
  candidateCount: number;
  tier?: ImageTier;
  runtime?: ImageMediaRuntime;
  storage?: CanonicalMediaStorage;
  persistCanonical?: boolean;
}

export async function generateViaAiRuntimeImageProvider(args: CreativeStudioImageBridgeArgs): Promise<{
  outcome: "OK" | "WAITING_CAPABILITY" | "FAILED";
  candidates: Array<{
    id: string;
    tenantId: string;
    missionId: string;
    status: "generated";
    uri: string;
    promptRef: string;
    aspectRatio: string;
    candidateGroup: string;
    referenceAssetIds: string[];
    revisionNumber: number;
    provider: string;
    model: string;
    isPhotographyClaim: false;
  }>;
  reason?: string;
}> {
  const runtime =
    args.runtime ??
    new ImageMediaRuntime({
      storage: args.storage,
      requireStorageForOperational: Boolean(args.storage) || Boolean(args.persistCanonical),
    });
  if (!runtime.isConfigured()) {
    return {
      outcome: "WAITING_CAPABILITY",
      candidates: [],
      reason: "image_provider_not_configured",
    };
  }

  const request: ImageGenerateRequest = {
    tenantId: args.brief.tenantId,
    missionId: args.brief.missionId,
    prompt: `${args.brief.singleMindedObjective}\n${args.brief.visualDirection}\n${args.brief.hook}`,
    aspectRatio: args.artDirection.aspectRatio,
    candidateCount: args.candidateCount,
    tier: args.tier ?? "standard",
    referenceAssetIds: args.referenceAssetIds,
    referenceImages: args.referenceImages,
    persistCanonical: args.persistCanonical ?? Boolean(args.storage),
  };

  const result = await runtime.generate(request);
  if (result.outcome !== "OK" || result.candidates.length === 0) {
    return {
      outcome:
        result.outcome === "NOT_CONFIGURED" || result.outcome === "WAITING_CONFIGURATION"
          ? "WAITING_CAPABILITY"
          : "FAILED",
      candidates: [],
      reason: result.reason ?? result.outcome,
    };
  }

  return {
    outcome: "OK",
    candidates: result.candidates.map((c, i) => ({
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
      isPhotographyClaim: false as const,
      _index: i,
    })),
  };
}
