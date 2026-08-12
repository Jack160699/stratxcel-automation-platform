/**
 * App-layer host bindings for Social / Reporting / service clients.
 * Adapters never invent clients; the host binds them.
 */

export type LooseServiceClient = {
  from: (table: string) => unknown;
  [key: string]: unknown;
};

export type HostErrorCategory =
  | "TRANSIENT"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "AUTH_CONFIGURATION"
  | "QUOTA"
  | "POLICY_BLOCK"
  | "INVALID_INPUT"
  | "UNSUPPORTED"
  | "PROVIDER_FAILURE"
  | "INTERNAL_FAILURE";

export interface SocialScheduleHostInput {
  tenantId: string;
  missionId?: string;
  requestId?: string;
  accountId: string;
  variantId: string;
  scheduledAtIso: string;
  timeZone: string;
  idempotencyKey: string;
  artifactId?: string | null;
  approvalGranted?: boolean;
  standingAuthorizationGranted?: boolean;
  standingAuthorizationCapability?: string;
}

export type SocialScheduleHostResult =
  | {
      ok: true;
      jobId: string;
      status: string;
      receiptDetail?: Record<string, unknown>;
    }
  | {
      ok: false;
      errorCategory: HostErrorCategory;
      errorMessage: string;
    };

export interface SocialPublishHostInput {
  tenantId: string;
  missionId?: string;
  requestId: string;
  accountId: string;
  variantId: string;
  /** @deprecated Ignored as authority — host derives owner from account. */
  ownerId?: string | null;
  artifactId: string;
  idempotencyKey: string;
  approvalGranted?: boolean;
  standingAuthorizationGranted?: boolean;
  standingAuthorizationCapability?: string;
  shadowMode?: boolean;
  killSwitchActive?: boolean;
  scheduledAtIso?: string | null;
  artifactVersion?: string | null;
  exactPayloadFingerprint?: string | null;
}

export type SocialPublishHostResult =
  | {
      ok: true;
      jobId: string;
      jobStatus: string;
      providerPostId?: string | null;
      publishedAtIso?: string | null;
      platform?: string | null;
      liveUrl?: string | null;
      externalMutationOccurred: boolean;
      receiptDetail?: Record<string, unknown>;
    }
  | {
      ok: false;
      errorCategory: HostErrorCategory;
      errorMessage: string;
      shadowPreventedMutation?: boolean;
      externalMutationOccurred?: boolean;
      jobId?: string;
      jobStatus?: string;
    };

export interface AnalyticsSourceSnapshot {
  source: string;
  status: string;
  reason: string | null;
  /** Real metrics only — never invent zeros for unavailable sources. */
  metrics: Record<string, unknown> | null;
}

export interface AnalyticsReadHostInput {
  tenantId: string;
  missionId?: string;
  requestId?: string;
  sources?: string[];
}

export type AnalyticsReadHostResult =
  | { ok: true; sources: AnalyticsSourceSnapshot[] }
  | { ok: false; errorCategory: HostErrorCategory; errorMessage: string };

export interface PersistMissionArtifactInput {
  tenantId: string;
  missionId: string;
  kind: string;
  storageRef?: string | null;
  metadata: Record<string, unknown>;
  requestId?: string;
  providerKey?: string;
  capability?: string;
}

export type PersistMissionArtifactResult =
  | { ok: true; id: string }
  | { ok: false; errorMessage: string };

export type WhatsAppOutboundHostInput = {
  tenantId: string;
  leadId: string;
  body: string;
  idempotencyKey: string;
  templateId?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: string[];
  isHumanInitiated?: boolean;
};

export type WhatsAppOutboundHostResult =
  | {
      ok: true;
      messageId: string;
      alreadySent?: boolean;
      mode?: string;
      providerId?: string | null;
    }
  | { ok: false; reason: string };

export interface CapabilityHostBindings {
  socialSchedule?: (input: SocialScheduleHostInput) => Promise<SocialScheduleHostResult>;
  socialPublish?: (input: SocialPublishHostInput) => Promise<SocialPublishHostResult>;
  analyticsRead?: (input: AnalyticsReadHostInput) => Promise<AnalyticsReadHostResult>;
  getServiceClient?: () => LooseServiceClient | null | Promise<LooseServiceClient | null>;
  persistMissionArtifact?: (
    input: PersistMissionArtifactInput,
  ) => Promise<PersistMissionArtifactResult>;
  /**
   * Optional wrap of the WhatsApp outbound choke-point (tests / instrumentation).
   * Production leaves this unbound so adapters call sendOutboundWhatsAppMessage directly.
   */
  sendWhatsAppOutbound?: (
    client: LooseServiceClient,
    input: WhatsAppOutboundHostInput,
  ) => Promise<WhatsAppOutboundHostResult>;
}

let bindings: CapabilityHostBindings = {};

export function bindCapabilityHost(next: CapabilityHostBindings): void {
  bindings = { ...bindings, ...next };
}

export function getCapabilityHost(): CapabilityHostBindings {
  return bindings;
}

export function isSocialScheduleHostBound(): boolean {
  return typeof bindings.socialSchedule === "function";
}

export function isSocialPublishHostBound(): boolean {
  return typeof bindings.socialPublish === "function";
}

export function isAnalyticsReadHostBound(): boolean {
  return typeof bindings.analyticsRead === "function";
}

export function resetCapabilityHostForTests(): void {
  bindings = {};
}
