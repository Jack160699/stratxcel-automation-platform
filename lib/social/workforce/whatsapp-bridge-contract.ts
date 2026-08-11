/**
 * WhatsApp bridge remains a channel into the same Social mission/artifact/approval state.
 * It must not become a second content engine.
 */

export interface WhatsAppSocialBridgeContract {
  sharesMissionState: true;
  sharesArtifactState: true;
  sharesApprovalState: true;
  separateContentEngine: false;
  deepLinksTenantScoped: true;
}

export const WHATSAPP_SOCIAL_BRIDGE_CONTRACT: WhatsAppSocialBridgeContract = {
  sharesMissionState: true,
  sharesArtifactState: true,
  sharesApprovalState: true,
  separateContentEngine: false,
  deepLinksTenantScoped: true,
};

export function assertWhatsAppUsesSharedSocialState(contract: WhatsAppSocialBridgeContract = WHATSAPP_SOCIAL_BRIDGE_CONTRACT): void {
  if (contract.separateContentEngine) {
    throw new Error("whatsapp_must_not_create_second_content_engine");
  }
  if (!contract.sharesMissionState || !contract.sharesArtifactState || !contract.sharesApprovalState) {
    throw new Error("whatsapp_must_share_mission_artifact_approval_state");
  }
  if (!contract.deepLinksTenantScoped) {
    throw new Error("whatsapp_deep_links_must_be_tenant_scoped");
  }
}
