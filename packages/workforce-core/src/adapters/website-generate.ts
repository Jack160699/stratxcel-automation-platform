import { generate5PageSite } from "@stratxcel/websites-and-domains";
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderReadinessProbeResult,
} from "../providers/types.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { getCapabilityHost } from "./host.ts";

const PROVIDER_KEY = "website-generate-domains";

/**
 * Draft-only website generation. Never claims production deploy authorization.
 * Persists the full generated site through the host artifact binder when available.
 */
export function createWebsiteGenerateProvider(): CapabilityProvider {
  return {
    key: PROVIDER_KEY,
    capabilityKeys: ["website.generate"],
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: true,
      status: "IMPLEMENTED",
      reasonCode: "READY",
      details: "websites-and-domains generate5PageSite (draft only)",
    }),
    execute: async (input): Promise<ProviderExecuteResult> => {
      const businessName =
        typeof input.input?.businessName === "string" ? input.input.businessName.trim() : "";
      if (!businessName) {
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: "INVALID_INPUT",
          errorMessage: "website.generate requires businessName",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const siteTenantId =
        typeof input.input?.siteTenantId === "string"
          ? input.input.siteTenantId
          : input.tenantId;
      if (siteTenantId !== input.tenantId) {
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: "POLICY_BLOCK",
          errorMessage: "TENANT_FORBIDDEN",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const site = generate5PageSite({
        tenantId: input.tenantId,
        businessName,
        industry: typeof input.input?.industry === "string" ? input.input.industry : undefined,
        businessDescription:
          typeof input.input?.businessDescription === "string"
            ? input.input.businessDescription
            : undefined,
        contactEmail:
          typeof input.input?.contactEmail === "string" ? input.input.contactEmail : undefined,
        contactPhone:
          typeof input.input?.contactPhone === "string" ? input.input.contactPhone : undefined,
      });

      const persist = getCapabilityHost().persistMissionArtifact;
      let artifactId: string | null = null;
      if (persist) {
        const persisted = await persist({
          tenantId: input.tenantId,
          missionId: input.missionId,
          kind: "website_draft",
          storageRef: `workforce://website.generate/${input.requestId}`,
          providerKey: PROVIDER_KEY,
          capability: "website.generate",
          requestId: input.requestId,
          metadata: {
            draftOnly: true,
            productionDeployAuthorized: false,
            deployed: false,
            previewSubdomain: site.previewSubdomain,
            pageCount: site.pages.length,
            site,
            provenance: {
              provider: PROVIDER_KEY,
              requestId: input.requestId,
              capability: "website.generate",
            },
          },
        });
        if (!persisted.ok) {
          return {
            ok: false,
            providerKey: PROVIDER_KEY,
            errorCategory: "PROVIDER_FAILURE",
            errorMessage: persisted.errorMessage,
            usage: unknownCostUsage({ requests: 0 }),
          };
        }
        artifactId = persisted.id;
      }

      const receipt = buildCapabilityExecutionReceipt({
        capability: "website.generate",
        providerKey: PROVIDER_KEY,
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        externalMutation: false,
        approvalUsed:
          input.authorization?.approvalGranted === true ||
          input.authorization?.standingAuthorizationGranted === true,
        outputArtifactIds: artifactId ? [artifactId] : [],
        detail: {
          pageCount: site.pages.length,
          previewSubdomain: site.previewSubdomain,
          productionDeployAuthorized: false,
          draftOnly: true,
          deployed: false,
          artifactPersisted: Boolean(artifactId),
        },
      });

      return {
        ok: true,
        providerKey: PROVIDER_KEY,
        providerReference: artifactId ?? site.previewSubdomain,
        outputArtifactIds: artifactId ? [artifactId] : [],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: receipt as unknown as Record<string, unknown>,
      };
    },
  };
}
