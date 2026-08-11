import type { CapabilityProvider, ProviderExecuteResult } from "../providers/types.ts";
import { unknownCostUsage } from "../providers/types.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { getCapabilityOperationClass } from "./operation-class.ts";
import {
  getCapabilityHost,
  isSocialPublishHostBound,
  isSocialScheduleHostBound,
} from "./host.ts";

export function createSocialScheduleProvider(): CapabilityProvider {
  return {
    key: "social-schedule-queue",
    capabilityKeys: ["social.schedule"],
    status: "IMPLEMENTED",
    probeReadiness: () => {
      if (!isSocialScheduleHostBound()) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "Social schedule host not bound",
        };
      }
      return {
        ready: true,
        status: "IMPLEMENTED",
        reasonCode: "READY",
        details: "Social scheduleJob host bound",
      };
    },
    execute: async (input): Promise<ProviderExecuteResult> => {
      const host = getCapabilityHost().socialSchedule;
      if (!host) {
        return {
          ok: false,
          providerKey: "social-schedule-queue",
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "Social schedule host not bound",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const accountId = typeof input.input?.accountId === "string" ? input.input.accountId : null;
      const variantId = typeof input.input?.variantId === "string" ? input.input.variantId : null;
      const scheduledAtIso =
        typeof input.input?.scheduledAtIso === "string"
          ? input.input.scheduledAtIso
          : typeof input.input?.scheduledAt === "string"
            ? input.input.scheduledAt
            : null;
      const timeZone = typeof input.input?.timeZone === "string" ? input.input.timeZone : null;
      const idempotencyKey =
        typeof input.input?.idempotencyKey === "string" && input.input.idempotencyKey.trim()
          ? input.input.idempotencyKey.trim()
          : null;

      if (!accountId || !variantId || !scheduledAtIso || !timeZone || !idempotencyKey) {
        return {
          ok: false,
          providerKey: "social-schedule-queue",
          errorCategory: "INVALID_INPUT",
          errorMessage:
            "social.schedule requires accountId, variantId, scheduledAtIso, timeZone, idempotencyKey",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (Number.isNaN(Date.parse(scheduledAtIso)) || Date.parse(scheduledAtIso) <= Date.now() - 60_000) {
        return {
          ok: false,
          providerKey: "social-schedule-queue",
          errorCategory: "INVALID_INPUT",
          errorMessage: "scheduledAtIso must be a valid future timestamp",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const result = await host({
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        accountId,
        variantId,
        scheduledAtIso,
        timeZone,
        idempotencyKey,
        artifactId: typeof input.input?.artifactId === "string" ? input.input.artifactId : null,
        approvalGranted: input.input?.approvalGranted === true,
        standingAuthorizationGranted: input.input?.standingAuthorizationGranted === true,
        standingAuthorizationCapability:
          typeof input.input?.standingAuthorizationCapability === "string"
            ? input.input.standingAuthorizationCapability
            : undefined,
      });

      if (!result.ok) {
        return {
          ok: false,
          providerKey: "social-schedule-queue",
          errorCategory: result.errorCategory,
          errorMessage: result.errorMessage,
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const receipt = buildCapabilityExecutionReceipt({
        capability: "social.schedule",
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        providerKey: "social-schedule-queue",
        operationClass: getCapabilityOperationClass("social.schedule"),
        externalMutation: false,
        externalMutationOccurred: false,
        idempotencyKey,
        inputArtifactIds: input.inputArtifactIds,
        outputArtifactIds: [result.jobId],
        integrationKey: "social_account",
        providerExternalId: result.jobId,
        detail: {
          kind: "schedule_receipt",
          jobId: result.jobId,
          status: result.status,
          scheduledAtIso,
          timeZone,
          accountId,
          variantId,
          published: false,
          ...(result.receiptDetail ?? {}),
        },
      });

      return {
        ok: true,
        providerKey: "social-schedule-queue",
        providerReference: result.jobId,
        outputArtifactIds: [result.jobId],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: receipt as unknown as Record<string, unknown>,
      };
    },
  };
}

export function createSocialPublishProvider(): CapabilityProvider {
  return {
    key: "social-publish-meta",
    capabilityKeys: ["social.publish"],
    status: "IMPLEMENTED",
    probeReadiness: () => {
      if (!isSocialPublishHostBound()) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "Social publish host not bound",
        };
      }
      return {
        ready: true,
        status: "IMPLEMENTED",
        reasonCode: "READY",
        details: "Social publish host bound",
      };
    },
    execute: async (input): Promise<ProviderExecuteResult> => {
      const host = getCapabilityHost().socialPublish;
      if (!host) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "Social publish host not bound",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const accountId = typeof input.input?.accountId === "string" ? input.input.accountId : null;
      const variantId = typeof input.input?.variantId === "string" ? input.input.variantId : null;
      const artifactId = typeof input.input?.artifactId === "string" ? input.input.artifactId : null;
      const ownerId = typeof input.input?.ownerId === "string" ? input.input.ownerId : null;
      const idempotencyKey =
        typeof input.input?.idempotencyKey === "string" && input.input.idempotencyKey.trim()
          ? input.input.idempotencyKey.trim()
          : null;

      if (!accountId || !variantId || !artifactId || !ownerId || !idempotencyKey) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: "INVALID_INPUT",
          errorMessage:
            "social.publish requires accountId, variantId, artifactId, ownerId, idempotencyKey",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (input.input?.killSwitchActive === true) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: "POLICY_BLOCK",
          errorMessage: "KILL_SWITCH_ACTIVE",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (input.input?.shadowMode === true) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: "POLICY_BLOCK",
          errorMessage: "SHADOW_BLOCKED",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      if (
        input.input?.externalPostId !== undefined ||
        input.input?.providerPublishId !== undefined
      ) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: "POLICY_BLOCK",
          errorMessage: "client_supplied_external_id_rejected",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const result = await host({
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        accountId,
        variantId,
        artifactId,
        ownerId,
        idempotencyKey,
        approvalGranted: input.input?.approvalGranted === true,
        standingAuthorizationGranted: input.input?.standingAuthorizationGranted === true,
        standingAuthorizationCapability:
          typeof input.input?.standingAuthorizationCapability === "string"
            ? input.input.standingAuthorizationCapability
            : undefined,
        shadowMode: false,
        killSwitchActive: false,
        scheduledAtIso:
          typeof input.input?.scheduledAtIso === "string" ? input.input.scheduledAtIso : null,
        artifactVersion:
          typeof input.input?.artifactVersion === "string" ? input.input.artifactVersion : null,
        exactPayloadFingerprint:
          typeof input.input?.exactPayloadFingerprint === "string"
            ? input.input.exactPayloadFingerprint
            : null,
      });

      if (!result.ok) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: result.errorCategory,
          errorMessage: result.errorMessage,
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const published =
        result.externalMutationOccurred === true &&
        Boolean(result.providerPostId) &&
        String(result.jobStatus ?? "").toUpperCase() === "PUBLISHED";

      if (result.externalMutationOccurred && !result.providerPostId) {
        return {
          ok: false,
          providerKey: "social-publish-meta",
          errorCategory: "PROVIDER_FAILURE",
          errorMessage: "missing_external_receipt",
          usage: unknownCostUsage({ requests: 1 }),
        };
      }

      const receipt = buildCapabilityExecutionReceipt({
        capability: "social.publish",
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        providerKey: "social-publish-meta",
        operationClass: getCapabilityOperationClass("social.publish"),
        externalMutation: true,
        externalMutationOccurred: published,
        approvalUsed: true,
        idempotencyKey,
        inputArtifactIds: input.inputArtifactIds,
        outputArtifactIds: [result.jobId],
        integrationKey: "social_account",
        providerExternalId: result.providerPostId ?? null,
        detail: {
          kind: "publish_receipt",
          jobId: result.jobId,
          jobStatus: result.jobStatus,
          platform: result.platform ?? null,
          providerPostId: result.providerPostId ?? null,
          publishedAtIso: result.publishedAtIso ?? null,
          liveUrl: result.liveUrl ?? null,
          artifactId,
          accountId,
          variantId,
          published,
          ...(result.receiptDetail ?? {}),
        },
      });

      return {
        ok: true,
        providerKey: "social-publish-meta",
        providerReference: result.jobId,
        outputArtifactIds: [result.jobId],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: receipt as unknown as Record<string, unknown>,
      };
    },
  };
}
