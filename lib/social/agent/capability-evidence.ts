/**
 * Safe product-capability evidence snapshot for Trust / marketing claim checks.
 * Never leaks admin secrets; only coarse runtime truth.
 */

export type CapabilityRuntimeStatus =
  | "OPERATIONAL"
  | "NOT_CONFIGURED"
  | "WAITING_CONFIGURATION"
  | "BLOCKED"
  | "UNKNOWN";

export interface ProductCapabilityEvidence {
  shadowMode: boolean;
  dryRun: boolean;
  socialPublishExecutable: boolean;
  imageGenerationStatus: CapabilityRuntimeStatus;
  whatsappSendStatus: CapabilityRuntimeStatus;
  capturedAtIso: string;
}

export function buildProductCapabilityEvidence(input: {
  shadowMode: boolean;
  dryRun?: boolean;
  socialPublishExecutable?: boolean;
  imageGenerationStatus?: CapabilityRuntimeStatus;
  whatsappSendStatus?: CapabilityRuntimeStatus;
  nowIso?: string;
}): ProductCapabilityEvidence {
  return {
    shadowMode: input.shadowMode,
    dryRun: input.dryRun ?? false,
    socialPublishExecutable: input.socialPublishExecutable === true && !input.shadowMode && !(input.dryRun ?? false),
    imageGenerationStatus: input.imageGenerationStatus ?? "NOT_CONFIGURED",
    whatsappSendStatus: input.whatsappSendStatus ?? "NOT_CONFIGURED",
    capturedAtIso: input.nowIso ?? new Date().toISOString(),
  };
}

/** Resolve image generation status from env / injected provider without inventing success. */
export function resolveImageGenerationRuntimeStatus(input?: {
  providerConfigured?: boolean;
  testProviderInjected?: boolean;
}): CapabilityRuntimeStatus {
  if (input?.testProviderInjected) return "OPERATIONAL";
  if (input?.providerConfigured) return "OPERATIONAL";
  return "NOT_CONFIGURED";
}
