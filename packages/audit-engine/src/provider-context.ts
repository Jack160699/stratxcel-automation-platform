import type { BrandBrainContent } from "@stratxcel/brand-brain";

/**
 * Explicit allowlist of business context fields that may be sent to AI providers
 * during Automatic Audit generation. Billing, auth, credentials, and unrelated
 * tenant secrets must never appear in provider payloads.
 */
export const AUDIT_PROVIDER_BUSINESS_CONTEXT_KEYS = [
  "businessName",
  "industry",
  "description",
  "productsServices",
  "priorityOffering",
  "customerSegments",
  "geography",
  "businessReach",
  "averageSpend",
  "acquisitionChannels",
  "purchaseChannels",
  "businessProblem",
  "primaryGoal",
  "successDefinition",
  "knownCompetitors",
  "existingMarketing",
  "bestAcquisitionSource",
  "triedAlready",
  "brandPersonality",
  "additionalBusinessContext",
  "websiteUrl",
  "onlineProfiles",
] as const;

export type AuditProviderBusinessContextKey =
  (typeof AUDIT_PROVIDER_BUSINESS_CONTEXT_KEYS)[number];

export type AuditProviderBusinessContext = {
  [K in AuditProviderBusinessContextKey]?: unknown;
} & {
  brandBrainVersion?: number;
};

const FORBIDDEN_PROVIDER_CONTEXT_KEYS = [
  "gstin",
  "gst",
  "gstInvoice",
  "gst_invoice",
  "billing",
  "billingAddress",
  "billing_address",
  "razorpay",
  "payment",
  "payment_link",
  "paymentLink",
  "auth",
  "session",
  "apiKey",
  "api_key",
  "oauth",
  "token",
  "accessToken",
  "refreshToken",
  "metaToken",
  "meta_token",
  "credential",
  "credentials",
  "password",
  "secret",
  "privateKey",
  "rules",
  "audit_intake",
  "schema_version",
  "source",
  "audit_order_id",
  "audit_intake_updated_at",
] as const;

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 4_000) : undefined;
}

function stringList(value: unknown, max = 20): string[] | undefined {
  if (!Array.isArray(value)) {
    const single = text(value);
    return single ? [single] : undefined;
  }
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, max);
  return items.length ? items : undefined;
}

function products(value: unknown): Array<{ name: string; description?: string }> | undefined {
  if (!Array.isArray(value)) {
    const listed = stringList(value, 12);
    return listed?.map((name) => ({ name }));
  }
  const items = value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) {
      return [{ name: item.trim().slice(0, 240) }];
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const name = text(row.name);
    if (!name) return [];
    return [{
      name: name.slice(0, 240),
      description: text(row.description)?.slice(0, 1_000),
    }];
  }).slice(0, 12);
  return items.length ? items : undefined;
}

/**
 * Builds the only business context packet allowed into Audit provider prompts.
 * Unknown Brand Brain keys and forbidden billing/auth fields are dropped.
 */
export function buildAuditProviderBusinessContext(input: {
  businessName: string;
  industry?: string | null;
  websiteUrl?: string | null;
  brandBrainVersion: number;
  brandBrain: BrandBrainContent | Record<string, unknown> | null | undefined;
}): AuditProviderBusinessContext {
  const brain = (input.brandBrain && typeof input.brandBrain === "object" && !Array.isArray(input.brandBrain))
    ? input.brandBrain as Record<string, unknown>
    : {};

  const context: AuditProviderBusinessContext = {
    brandBrainVersion: input.brandBrainVersion,
    businessName: text(input.businessName) ?? text(brain.business_name),
    industry: text(input.industry) ?? text(brain.industry),
    description: text(brain.business_description) ?? text(brain.description),
    productsServices: products(brain.products),
    priorityOffering: text(brain.priority_offering),
    customerSegments: stringList(brain.customer_segments)
      ?? stringList(
        typeof brain.target_audience === "string"
          ? brain.target_audience.split(",").map((part) => part.trim())
          : brain.target_audience,
      ),
    geography: text(brain.location),
    businessReach: text(brain.business_reach),
    averageSpend: text(brain.average_customer_spend),
    acquisitionChannels: stringList(brain.discovery_channels),
    purchaseChannels: stringList(brain.purchase_channels),
    businessProblem: text(brain.biggest_business_problem),
    primaryGoal: text(brain.growth_priority),
    successDefinition: text(brain.ninety_day_success),
    knownCompetitors: stringList(brain.competitors),
    existingMarketing: stringList(brain.current_marketing),
    bestAcquisitionSource: text(brain.best_customer_source),
    triedAlready: text(brain.previous_attempts),
    brandPersonality: stringList(brain.brand_personality)
      ?? (text(brain.tone_of_voice) ? [String(brain.tone_of_voice)] : undefined),
    additionalBusinessContext: text(brain.additional_notes),
    websiteUrl: text(input.websiteUrl) ?? text(brain.website_url),
    onlineProfiles: stringList(brain.online_profiles),
  };

  for (const key of Object.keys(context) as Array<keyof AuditProviderBusinessContext>) {
    if (context[key] == null || context[key] === "") {
      delete context[key];
    }
  }
  return context;
}

export function assertAuditProviderContextPrivacy(
  payload: unknown,
): { ok: true } | { ok: false; forbiddenKeys: string[] } {
  const serialized = JSON.stringify(payload ?? {}).toLocaleLowerCase();
  const forbiddenKeys = FORBIDDEN_PROVIDER_CONTEXT_KEYS.filter((key) => {
    const needle = `"${key.toLocaleLowerCase()}"`;
    return serialized.includes(needle);
  });
  return forbiddenKeys.length ? { ok: false, forbiddenKeys } : { ok: true };
}

export function listForbiddenAuditProviderContextKeys(): readonly string[] {
  return FORBIDDEN_PROVIDER_CONTEXT_KEYS;
}
