export type ExternalMutationKind = "publish_post" | "reply_message" | "provider_write";

export interface ExternalMutationDecision {
  allowed: boolean;
  mode: "LIVE" | "SHADOW";
  reason: string;
}

/**
 * The single authoritative boundary for external provider mutations.
 * Autonomy controls whether internal work needs approval; SHADOW controls
 * whether a provider write is allowed to leave Stratxcel.
 */
export function externalMutationDecision(shadowMode: boolean, action: ExternalMutationKind): ExternalMutationDecision {
  if (shadowMode) {
    return {
      allowed: false,
      mode: "SHADOW",
      reason: `${action} simulated because SHADOW mode blocks external provider mutations`,
    };
  }
  return { allowed: true, mode: "LIVE", reason: `${action} allowed by LIVE publishing mode` };
}
