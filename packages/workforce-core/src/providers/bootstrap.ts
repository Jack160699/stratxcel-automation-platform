import type { CapabilityKey } from "../capabilities/types.ts";
import { registerProvider, getProvider, resetProviderRegistryForTests } from "./registry.ts";
import {
  unknownCostUsage,
  type CapabilityProvider,
  type ProviderExecuteInput,
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

function implementedStub(args: {
  key: string;
  capabilityKeys: readonly CapabilityKey[];
  execute: (input: ProviderExecuteInput) => Promise<ProviderExecuteResult>;
}): CapabilityProvider {
  return {
    key: args.key,
    capabilityKeys: args.capabilityKeys,
    status: "IMPLEMENTED",
    probeReadiness: (): ProviderReadinessProbeResult => ({
      ready: true,
      status: "IMPLEMENTED",
      reasonCode: "READY",
    }),
    execute: args.execute,
  };
}

/**
 * Register real/placeholder providers. Idempotent.
 * Registration does not imply runtime readiness.
 */
export function bootstrapCapabilityProviders(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  registerProvider(
    implementedStub({
      key: "content-shortform-hermes",
      capabilityKeys: ["content.shortform"],
      execute: async (input) => ({
        ok: true,
        providerKey: "content-shortform-hermes",
        providerReference: `content-shortform:${input.requestId}`,
        outputArtifactIds: [`artifact:shortform:${input.requestId}`],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: "shortform_copy", simulated: true },
      }),
    }),
  );

  registerProvider(
    implementedStub({
      key: "social-schedule-queue",
      capabilityKeys: ["social.schedule"],
      execute: async (input) => ({
        ok: true,
        providerKey: "social-schedule-queue",
        providerReference: `schedule:${input.requestId}`,
        outputArtifactIds: [`artifact:schedule:${input.requestId}`],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: "schedule_receipt", simulated: true },
      }),
    }),
  );

  registerProvider(
    implementedStub({
      key: "social-publish-meta",
      capabilityKeys: ["social.publish"],
      execute: async (input) => ({
        ok: true,
        providerKey: "social-publish-meta",
        providerReference: `publish:${input.requestId}`,
        outputArtifactIds: [`artifact:publish:${input.requestId}`],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: "publish_receipt", simulated: true },
      }),
    }),
  );

  registerProvider(
    implementedStub({
      key: "seo-audit-search-discovery",
      capabilityKeys: ["seo.audit"],
      execute: async (input) => ({
        ok: true,
        providerKey: "seo-audit-search-discovery",
        providerReference: `seo-audit:${input.requestId}`,
        outputArtifactIds: [`artifact:seo_audit:${input.requestId}`],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: "seo_audit_report", simulated: true },
      }),
    }),
  );

  registerProvider(
    implementedStub({
      key: "website-generate-domains",
      capabilityKeys: ["website.generate"],
      execute: async (input) => ({
        ok: true,
        providerKey: "website-generate-domains",
        providerReference: `website-draft:${input.requestId}`,
        outputArtifactIds: [`artifact:website_draft:${input.requestId}`],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: "website_draft", simulated: true },
      }),
    }),
  );

  registerProvider(
    implementedStub({
      key: "crm-supabase",
      capabilityKeys: ["crm.read", "crm.write"],
      execute: async (input) => ({
        ok: true,
        providerKey: "crm-supabase",
        providerReference: `crm:${input.capability}:${input.requestId}`,
        outputArtifactIds: [
          input.capability === "crm.write"
            ? `artifact:crm_write:${input.requestId}`
            : `artifact:crm_snapshot:${input.requestId}`,
        ],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: input.capability === "crm.write" ? "crm_write_receipt" : "crm_snapshot", simulated: true },
      }),
    }),
  );

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
      reason: "Carousel generation pipeline not implemented",
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
