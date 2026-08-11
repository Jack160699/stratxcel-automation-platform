import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderReadinessProbeResult,
} from "../providers/types.ts";
import { getCapabilityHost } from "./host.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { getCapabilityOperationClass } from "./operation-class.ts";

const PROVIDER_KEY = "analytics-read-reporting";

const UNAVAILABLE_STATUSES = new Set([
  "not_configured",
  "not_connected",
  "error",
  "permission_required",
  "no_data",
]);

export function createAnalyticsReadProvider(): CapabilityProvider {
  return {
    key: PROVIDER_KEY,
    capabilityKeys: ["analytics.read"],
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => {
      const host = getCapabilityHost();
      if (!host.analyticsRead) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "analyticsRead host binding missing",
        };
      }
      return {
        ready: true,
        status: "IMPLEMENTED",
        reasonCode: "READY",
        details: "Reporting analytics host bound",
      };
    },
    execute: async (input): Promise<ProviderExecuteResult> => {
      const host = getCapabilityHost();
      if (!host.analyticsRead) {
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "analyticsRead host binding missing",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const result = await host.analyticsRead({
        tenantId: input.tenantId,
        sources: Array.isArray(input.input?.sources)
          ? (input.input.sources as string[])
          : undefined,
      });

      if (!result.ok) {
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: result.errorCategory,
          errorMessage: result.errorMessage,
          usage: unknownCostUsage({ requests: 1 }),
        };
      }

      // Honesty: unavailable sources must not expose invented metric zeros.
      const sources = result.sources.map((s) => {
        const available = !UNAVAILABLE_STATUSES.has(String(s.status).toLowerCase());
        return {
          source: s.source,
          status: s.status,
          reason: s.reason,
          available,
          metrics: available ? s.metrics : null,
        };
      });

      const snapshotId = `analytics_snapshot_${crypto.randomUUID()}`;
      const receipt = buildCapabilityExecutionReceipt({
        capability: "analytics.read",
        providerKey: PROVIDER_KEY,
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        operationClass: getCapabilityOperationClass("analytics.read"),
        externalMutation: false,
        externalMutationOccurred: false,
        inputArtifactIds: input.inputArtifactIds,
        outputArtifactIds: [snapshotId],
        detail: {
          kind: "analytics_evidence",
          snapshotId,
          metricsInvented: false,
        },
      });

      return {
        ok: true,
        providerKey: PROVIDER_KEY,
        providerReference: snapshotId,
        outputArtifactIds: [snapshotId],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { ...receipt, sources } as unknown as Record<string, unknown>,
      };
    },
  };
}
