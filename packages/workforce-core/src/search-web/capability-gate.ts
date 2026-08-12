import { getCapability } from "../capabilities/registry.ts";
import type { StageState } from "../planning/types.ts";

export type CapabilityGateResolution = {
  status: StageState | "RESEARCH_REQUIRED";
  blockedCapability?: string;
  reason: string;
  executable: boolean;
};

const BLOCKING_STATUSES = new Set(["UNAVAILABLE", "NOT_CONFIGURED", "PLANNED"]);

export function resolveSerpCapabilityGate(): CapabilityGateResolution {
  const cap = getCapability("research.serp");
  if (!cap) {
    return {
      status: "WAITING_CAPABILITY",
      blockedCapability: "research.serp",
      reason: "research.serp capability missing from registry",
      executable: false,
    };
  }
  if (BLOCKING_STATUSES.has(cap.status)) {
    return {
      status: "WAITING_CAPABILITY",
      blockedCapability: "research.serp",
      reason:
        cap.status === "NOT_CONFIGURED"
          ? "RESEARCH_REQUIRED: research.serp is NOT_CONFIGURED; Search Console covers authorized owned properties, not public SERP rankings"
          : `RESEARCH_REQUIRED: research.serp status is ${cap.status}`,
      executable: false,
    };
  }
  return {
    status: "READY",
    reason: "research.serp available",
    executable: true,
  };
}

export function resolveSeoPublishGate(executionAuthorized: boolean): CapabilityGateResolution {
  const cap = getCapability("seo.publish");
  if (!cap) {
    return {
      status: "WAITING_CAPABILITY",
      blockedCapability: "seo.publish",
      reason: "seo.publish missing",
      executable: false,
    };
  }
  if (!executionAuthorized || cap.externalMutation) {
    if (!executionAuthorized) {
      return {
        status: "WAITING_APPROVAL",
        blockedCapability: "seo.publish",
        reason: "SEO publish requires explicit execution authorization",
        executable: false,
      };
    }
  }
  if (BLOCKING_STATUSES.has(cap.status)) {
    return {
      status: "WAITING_CAPABILITY",
      blockedCapability: "seo.publish",
      reason: `seo.publish status is ${cap.status}`,
      executable: false,
    };
  }
  return {
    status: "READY",
    reason: "seo.publish authorized",
    executable: true,
  };
}

export class CrossTenantSiteError extends Error {
  readonly code = "cross_tenant_site_rejected";
  constructor(message = "cross_tenant_site_rejected") {
    super(message);
    this.name = "CrossTenantSiteError";
  }
}

export function assertTenantScope(trustedTenantId: string, siteTenantId: string): void {
  if (trustedTenantId !== siteTenantId) {
    throw new CrossTenantSiteError("cross_tenant_site_rejected");
  }
}

export function isSerpStyleBlocked(capabilityKey: string): boolean {
  const cap = getCapability(capabilityKey);
  if (!cap) return true;
  return BLOCKING_STATUSES.has(cap.status);
}
