import type {
  CompanyOpsContext,
  IntegrationFlags,
  OnboardingReadiness,
  CompanyOpsReadinessDimension,
  ReadinessItem,
  ReadinessStatus,
} from "../types.ts";

const ALL_DIMENSIONS: readonly CompanyOpsReadinessDimension[] = [
  "business_context",
  "brand_brain",
  "website",
  "social",
  "analytics",
  "crm",
  "whatsapp",
  "ads",
  "billing",
  "permissions",
] as const;

/** Purchased services → required readiness dimensions (never force irrelevant integrations). */
const SERVICE_REQUIREMENTS: Record<string, readonly CompanyOpsReadinessDimension[]> = {
  social_package: ["business_context", "brand_brain", "social", "billing", "permissions"],
  brand_audit: ["business_context", "brand_brain", "billing", "permissions"],
  audit: ["business_context", "brand_brain", "billing", "permissions"],
  seo_content: ["business_context", "brand_brain", "website", "billing", "permissions"],
  website: ["business_context", "brand_brain", "website", "billing", "permissions"],
  whatsapp: ["business_context", "brand_brain", "whatsapp", "crm", "billing", "permissions"],
  crm: ["business_context", "brand_brain", "crm", "billing", "permissions"],
  ads: ["business_context", "brand_brain", "ads", "social", "billing", "permissions"],
  analytics: ["business_context", "brand_brain", "analytics", "billing", "permissions"],
};

function requiredDimensions(purchasedServices: readonly string[]): Set<CompanyOpsReadinessDimension> {
  const required = new Set<CompanyOpsReadinessDimension>();
  for (const service of purchasedServices) {
    const dims = SERVICE_REQUIREMENTS[service] ?? ["business_context", "brand_brain", "billing", "permissions"];
    for (const d of dims) required.add(d);
  }
  if (purchasedServices.length === 0) {
    required.add("business_context");
    required.add("brand_brain");
    required.add("billing");
    required.add("permissions");
  }
  return required;
}

function dimensionReady(dimension: CompanyOpsReadinessDimension, ctx: CompanyOpsContext): boolean {
  const integrations: IntegrationFlags = ctx.integrations ?? {};
  switch (dimension) {
    case "business_context":
      return Boolean(ctx.brandBrainBusinessName) || ctx.brandBrainComplete;
    case "brand_brain":
      return ctx.brandBrainComplete === true;
    case "website":
      return integrations.website === true;
    case "social":
      return integrations.social === true;
    case "analytics":
      return integrations.analytics === true;
    case "crm":
      return integrations.crm === true;
    case "whatsapp":
      return integrations.whatsapp === true;
    case "ads":
      return integrations.ads === true;
    case "billing":
      return ctx.paymentState === "current";
    case "permissions":
      return ctx.permissionsGranted === true;
    default:
      return false;
  }
}

function statusFor(
  dimension: CompanyOpsReadinessDimension,
  required: Set<CompanyOpsReadinessDimension>,
  ctx: CompanyOpsContext,
): ReadinessStatus {
  if (!required.has(dimension)) return "NOT_REQUIRED";
  if (dimensionReady(dimension, ctx)) return "READY";
  if (dimension === "billing" && (ctx.paymentState === "failed" || ctx.paymentState === "past_due")) {
    return "DEGRADED";
  }
  return "MISSING";
}

export function buildOnboardingReadiness(ctx: CompanyOpsContext): OnboardingReadiness {
  const required = requiredDimensions(ctx.purchasedServices);
  const items: ReadinessItem[] = ALL_DIMENSIONS.map((dimension) => {
    const status = statusFor(dimension, required, ctx);
    return {
      dimension,
      status,
      required: required.has(dimension),
      detail:
        status === "NOT_REQUIRED"
          ? `Not required for purchased services: ${ctx.purchasedServices.join(", ") || "none"}`
          : status === "READY"
            ? `${dimension} ready`
            : `${dimension} needs attention`,
    };
  });

  const missingRequired = items
    .filter((i) => i.required && (i.status === "MISSING" || i.status === "DEGRADED"))
    .map((i) => i.dimension);

  return {
    tenantId: ctx.tenantId,
    purchasedServices: [...ctx.purchasedServices],
    items,
    missingRequired,
    ready: missingRequired.length === 0,
  };
}
