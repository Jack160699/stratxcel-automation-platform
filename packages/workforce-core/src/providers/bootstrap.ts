import type { CapabilityKey } from "../capabilities/types.ts";
import { registerProvider, getProvider, resetProviderRegistryForTests } from "./registry.ts";
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderImplementationStatus,
  type ProviderReadinessProbeResult,
} from "./types.ts";
import { createWorkforceImageGenerationProvider } from "./image-generation.ts";
import { createSeoAuditProvider } from "../adapters/seo-audit.ts";
import { createWebsiteGenerateProvider } from "../adapters/website-generate.ts";
import { createCrmProvider } from "../adapters/crm.ts";
import { createWhatsAppSendProvider } from "../adapters/whatsapp.ts";
import { createSocialScheduleProvider, createSocialPublishProvider } from "../adapters/social.ts";
import { createAnalyticsReadProvider } from "../adapters/analytics.ts";
import { buildCapabilityExecutionReceipt } from "../adapters/receipts.ts";
import { getCapabilityOperationClass } from "../adapters/operation-class.ts";
import { assertSafePublicHttpUrl } from "../adapters/url-safety.ts";

let bootstrapped = false;

function placeholderProvider(args: {
  key: string;
  capabilityKeys: readonly CapabilityKey[];
  status: ProviderImplementationStatus;
  reason: string;
}): CapabilityProvider {
  return {
    key: args.key,
    capabilityKeys: args.capabilityKeys,
    status: args.status,
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: false,
      status: args.status,
      reasonCode: args.status === "NOT_CONFIGURED" ? "PROVIDER_NOT_CONFIGURED" : "PROVIDER_UNAVAILABLE",
      details: args.reason,
    }),
    execute: async (): Promise<ProviderExecuteResult> => ({
      ok: false,
      providerKey: args.key,
      errorCategory: args.status === "NOT_CONFIGURED" ? "AUTH_CONFIGURATION" : "UNSUPPORTED",
      errorMessage: args.reason,
      usage: unknownCostUsage({ requests: 0 }),
    }),
  };
}

/**
 * Register real/placeholder providers. Idempotent.
 * Never registers simulated ok:true providers.
 */
export function bootstrapCapabilityProviders(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  registerProvider(
    placeholderProvider({
      key: "content-shortform-hermes",
      capabilityKeys: ["content.shortform"],
      status: "NOT_CONFIGURED",
      reason:
        "PENDING_AI_RUNTIME_PR_45: short-form content workforce provider awaits AI runtime merge",
    }),
  );

  registerProvider(createSocialScheduleProvider());
  registerProvider(createSocialPublishProvider());
  registerProvider(createSeoAuditProvider());
  registerProvider(createWebsiteGenerateProvider());
  registerProvider(createCrmProvider());
  registerProvider(createWhatsAppSendProvider());
  registerProvider(createAnalyticsReadProvider());

  registerProvider({
    key: "website-audit-internal",
    capabilityKeys: ["website.audit"],
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: true,
      status: "IMPLEMENTED",
      reasonCode: "READY",
      details: "Internal search-web website audit engine",
    }),
    execute: async (input): Promise<ProviderExecuteResult> => {
      const { buildWebsiteAudit } = await import("../search-web/website-audit.ts");
      const pages = Array.isArray(input.input?.pages)
        ? (input.input.pages as {
            url: string;
            strength?: "strong" | "weak" | "unknown";
            title?: string;
          }[])
        : null;
      const propertyUrl =
        typeof input.input?.propertyUrl === "string" ? input.input.propertyUrl : null;
      if (!pages || !propertyUrl) {
        return {
          ok: false,
          providerKey: "website-audit-internal",
          errorCategory: "INVALID_INPUT",
          errorMessage: "website.audit requires propertyUrl and pages inventory input",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      let safePropertyUrl: string;
      try {
        safePropertyUrl = assertSafePublicHttpUrl(propertyUrl, "propertyUrl");
        for (const page of pages) assertSafePublicHttpUrl(page.url, "page.url");
      } catch (err) {
        return {
          ok: false,
          providerKey: "website-audit-internal",
          errorCategory: "INVALID_INPUT",
          errorMessage: err instanceof Error ? err.message : "invalid_url",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      const siteTenantId =
        typeof input.input?.siteTenantId === "string" ? input.input.siteTenantId : input.tenantId;
      if (siteTenantId !== input.tenantId) {
        return {
          ok: false,
          providerKey: "website-audit-internal",
          errorCategory: "POLICY_BLOCK",
          errorMessage: "TENANT_FORBIDDEN",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }

      try {
        const audit = buildWebsiteAudit({
          trustedTenantId: input.tenantId,
          siteTenantId: input.tenantId,
          propertyUrl: safePropertyUrl,
          pages,
          conversionFindings: Array.isArray(input.input?.conversionFindings)
            ? (input.input.conversionFindings as never[])
            : undefined,
        });
        const receipt = buildCapabilityExecutionReceipt({
          capability: "website.audit",
          tenantId: input.tenantId,
          missionId: input.missionId,
          requestId: input.requestId,
          providerKey: "website-audit-internal",
          operationClass: getCapabilityOperationClass("website.audit"),
          externalMutation: false,
          externalMutationOccurred: false,
          inputArtifactIds: input.inputArtifactIds,
          outputArtifactIds: [audit.id],
          detail: {
            kind: "website_audit_report",
            engine: "search-web/website-audit",
            propertyUrl: audit.propertyUrl,
            strongPageCount: audit.strongPages.length,
            weakPageCount: audit.weakPages.length,
            missionId: input.missionId,
          },
        });
        return {
          ok: true,
          providerKey: "website-audit-internal",
          providerReference: audit.id,
          outputArtifactIds: [audit.id],
          usage: unknownCostUsage({ requests: 1 }),
          receipt: receipt as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          providerKey: "website-audit-internal",
          errorCategory: /tenant|scope/i.test(message) ? "POLICY_BLOCK" : "PROVIDER_FAILURE",
          errorMessage: /tenant|scope/i.test(message) ? "TENANT_FORBIDDEN" : message.slice(0, 500),
          usage: unknownCostUsage({ requests: 0 }),
        };
      }
    },
  });

  // Placeholders — registered but NOT_CONFIGURED / UNAVAILABLE
  registerProvider(createWorkforceImageGenerationProvider());
  registerProvider(
    placeholderProvider({
      key: "media-carousel-placeholder",
      capabilityKeys: ["media.carousel_generation"],
      status: "UNAVAILABLE",
      reason: "Carousel generation pipeline not implemented without fake images",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "media-video-placeholder",
      capabilityKeys: ["media.video_generation"],
      status: "UNAVAILABLE",
      reason: "Video generation intentionally unsupported",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "seo-publish-placeholder",
      capabilityKeys: ["seo.publish"],
      status: "NOT_CONFIGURED",
      reason: "SEO publish CMS bridge not configured",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "content-publish-placeholder",
      capabilityKeys: ["content.publish"],
      status: "NOT_CONFIGURED",
      reason: "Content publish bridge not configured",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "ads-publish-placeholder",
      capabilityKeys: ["ads.publish"],
      status: "UNAVAILABLE",
      reason: "Ads publish is planning-only; no Marketing API path",
    }),
  );
}

export function resetAndBootstrapProvidersForTests(): void {
  resetProviderRegistryForTests();
  bootstrapped = false;
  bootstrapCapabilityProviders();
}

export function ensureProviderBootstrapped(key: string): boolean {
  bootstrapCapabilityProviders();
  return !!getProvider(key);
}

bootstrapCapabilityProviders();
