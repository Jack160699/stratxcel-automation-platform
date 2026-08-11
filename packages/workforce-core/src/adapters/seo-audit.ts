import type { TechnicalPage } from "@stratxcel/search-discovery";
import { buildSeoAuditReport } from "../search-web/seo-audit.ts";
import { CrossTenantSiteError } from "../search-web/capability-gate.ts";
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderReadinessProbeResult,
} from "../providers/types.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { assertSafePublicHttpUrl, UnsafePublicUrlError } from "./url-safety.ts";

const PROVIDER_KEY = "seo-audit-search-discovery";

function asPages(raw: unknown): TechnicalPage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const pages: TechnicalPage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string" || !url.trim()) return null;
    pages.push(item as TechnicalPage);
  }
  return pages;
}

export function createSeoAuditProvider(): CapabilityProvider {
  return {
    key: PROVIDER_KEY,
    capabilityKeys: ["seo.audit"],
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: true,
      status: "IMPLEMENTED",
      reasonCode: "READY",
      details: "search-web buildSeoAuditReport wired",
    }),
    execute: async (input): Promise<ProviderExecuteResult> => {
      const propertyUrl =
        typeof input.input?.propertyUrl === "string" ? input.input.propertyUrl : null;
      const siteTenantId =
        typeof input.input?.siteTenantId === "string"
          ? input.input.siteTenantId
          : input.tenantId;
      const pages = asPages(input.input?.pages);
      const siteRaw = (input.input?.site ?? {}) as {
        https?: boolean;
        robotsPresent?: boolean;
        sitemapPresent?: boolean;
      };

      if (!propertyUrl || !pages) {
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: "INVALID_INPUT",
          errorMessage: "seo.audit requires propertyUrl and non-empty pages",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      try {
        assertSafePublicHttpUrl(propertyUrl);
        for (const page of pages) {
          assertSafePublicHttpUrl(page.url);
        }
      } catch (err) {
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: "POLICY_BLOCK",
          errorMessage:
            err instanceof UnsafePublicUrlError ? err.message : "unsafe_public_url",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      try {
        const report = buildSeoAuditReport({
          trustedTenantId: input.tenantId,
          siteTenantId,
          propertyUrl,
          pages,
          site: {
            https: siteRaw.https !== false,
            robotsPresent: siteRaw.robotsPresent === true,
            sitemapPresent: siteRaw.sitemapPresent === true,
          },
          evidenceIds: Array.isArray(input.input?.evidenceIds)
            ? (input.input.evidenceIds as string[])
            : undefined,
        });

        const receipt = buildCapabilityExecutionReceipt({
          capability: "seo.audit",
          providerKey: PROVIDER_KEY,
          tenantId: input.tenantId,
          missionId: input.missionId,
          requestId: input.requestId,
          externalMutation: false,
          detail: {
            reportId: report.id,
            propertyUrl: report.propertyUrl,
            findingCount: report.findings.length,
          },
        });

        return {
          ok: true,
          providerKey: PROVIDER_KEY,
          providerReference: report.id,
          outputArtifactIds: [report.id],
          usage: unknownCostUsage({ requests: 1 }),
          receipt: receipt as unknown as Record<string, unknown>,
        };
      } catch (err) {
        if (err instanceof CrossTenantSiteError) {
          return {
            ok: false,
            providerKey: PROVIDER_KEY,
            errorCategory: "POLICY_BLOCK",
            errorMessage: "TENANT_FORBIDDEN",
            usage: unknownCostUsage({ requests: 0 }),
          };
        }
        return {
          ok: false,
          providerKey: PROVIDER_KEY,
          errorCategory: "PROVIDER_FAILURE",
          errorMessage: err instanceof Error ? err.message : "seo_audit_failed",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }
    },
  };
}
