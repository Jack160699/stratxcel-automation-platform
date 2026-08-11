import type { CapabilityKey } from "../capabilities/types.ts";
import { registerProvider, getProvider, resetProviderRegistryForTests } from "./registry.ts";
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteResult,
  type ProviderImplementationStatus,
  type ProviderReadinessProbeResult,
} from "./types.ts";

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
 * Registration does not imply runtime readiness.
 * Never registers simulated ok:true providers.
 */
export function bootstrapCapabilityProviders(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // Formerly stubbed capabilities — truthful NOT_CONFIGURED placeholders only.
  registerProvider(
    placeholderProvider({
      key: "content-shortform-hermes",
      capabilityKeys: ["content.shortform"],
      status: "NOT_CONFIGURED",
      reason: "Short-form content provider not configured for workforce execution",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "social-schedule-queue",
      capabilityKeys: ["social.schedule"],
      status: "NOT_CONFIGURED",
      reason: "Social schedule queue provider not configured for workforce execution",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "social-publish-meta",
      capabilityKeys: ["social.publish"],
      status: "NOT_CONFIGURED",
      reason: "Social publish provider not configured for workforce execution",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "seo-audit-search-discovery",
      capabilityKeys: ["seo.audit"],
      status: "NOT_CONFIGURED",
      reason: "SEO audit capability provider not wired; use search-web department engine separately",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "website-generate-domains",
      capabilityKeys: ["website.generate"],
      status: "NOT_CONFIGURED",
      reason: "Website generate provider not configured for workforce capability path",
    }),
  );
  registerProvider(
    placeholderProvider({
      key: "crm-supabase",
      capabilityKeys: ["crm.read", "crm.write"],
      status: "NOT_CONFIGURED",
      reason: "CRM provider not configured for workforce capability path",
    }),
  );

  // Internal website audit — calls real search-web engine; no simulated receipts.
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
          errorCategory: "UNSUPPORTED",
          errorMessage: "website.audit requires propertyUrl and pages inventory input",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }
      const audit = buildWebsiteAudit({
        trustedTenantId: input.tenantId,
        siteTenantId: input.tenantId,
        propertyUrl,
        pages,
        conversionFindings: Array.isArray(input.input?.conversionFindings)
          ? (input.input.conversionFindings as never[])
          : undefined,
      });
      return {
        ok: true,
        providerKey: "website-audit-internal",
        providerReference: audit.id,
        outputArtifactIds: [audit.id],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: {
          kind: "website_audit_report",
          engine: "search-web/website-audit",
          propertyUrl: audit.propertyUrl,
          strongPageCount: audit.strongPages.length,
          weakPageCount: audit.weakPages.length,
        },
      };
    },
  });

  // Placeholders — registered but NOT_CONFIGURED / UNAVAILABLE
  registerProvider(
    placeholderProvider({
      key: "media-image-placeholder",
      capabilityKeys: ["media.image_generation"],
      status: "NOT_CONFIGURED",
      reason: "Controlled image generation provider not configured",
    }),
  );
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
      key: "whatsapp-meta",
      capabilityKeys: ["whatsapp.send"],
      status: "NOT_CONFIGURED",
      reason: "WhatsApp integration mode / binding not configured for workforce execution",
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
      key: "analytics-read-placeholder",
      capabilityKeys: ["analytics.read"],
      status: "NOT_CONFIGURED",
      reason: "Analytics property bridge not configured for workforce path",
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

/** Test helper: clear and re-bootstrap. */
export function resetAndBootstrapProvidersForTests(): void {
  resetProviderRegistryForTests();
  bootstrapped = false;
  bootstrapCapabilityProviders();
}

export function ensureProviderBootstrapped(key: string): boolean {
  bootstrapCapabilityProviders();
  return !!getProvider(key);
}

// Eager bootstrap on import so department workstreams can request capabilities immediately.
bootstrapCapabilityProviders();
