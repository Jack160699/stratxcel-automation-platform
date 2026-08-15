import type { BrandBrainContent } from "@stratxcel/brand-brain";

export interface AuditIntakeBrandBrainSource {
  id?: unknown;
  business_name?: unknown;
  industry?: unknown;
  website_url?: unknown;
  social_links?: unknown;
  deep_dive_answers?: unknown;
  goals_answers?: unknown;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  const raw = text(value);
  if (!raw) return [];
  return raw
    .split(/\n|,|;/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function productList(value: unknown): { name: string; description: string }[] {
  return list(value).slice(0, 12).map((name) => ({ name, description: "" }));
}

function existingText(content: BrandBrainContent, key: string): string {
  return text(content[key]);
}

/**
 * Converts the paid Audit intake into the reusable tenant Brand Brain.
 * Billing-only data (for example gstInvoice) is deliberately excluded: the
 * Brand Brain is business/marketing context, not a billing profile.
 */
export function buildBrandBrainContentFromAuditIntake(
  order: AuditIntakeBrandBrainSource,
  existing: BrandBrainContent | null = null,
): BrandBrainContent {
  const base = existing ?? {};
  const deepDive = record(order.deep_dive_answers);
  const goals = record(order.goals_answers);
  const intakeMeta = record(deepDive.intakeMeta);

  const customerSegments = unique(
    list(deepDive.customerSegments).length > 0
      ? list(deepDive.customerSegments)
      : list(deepDive.idealCustomers),
  );
  const reasonsChosen = unique(
    list(deepDive.reasonsChosen).length > 0
      ? list(deepDive.reasonsChosen)
      : list(deepDive.differentiation),
  );
  const discoveryChannels = unique(
    list(deepDive.discoveryChannels).length > 0
      ? list(deepDive.discoveryChannels)
      : list(deepDive.leadSources),
  );
  const purchaseChannels = unique(
    list(deepDive.purchaseChannels).length > 0
      ? list(deepDive.purchaseChannels)
      : list(deepDive.salesProcess),
  );
  const personality = unique(list(deepDive.brandPersonality)).slice(0, 3);
  const rawCurrentMarketing = unique(list(deepDive.currentMarketing));
  const currentMarketing = rawCurrentMarketing.includes("nothing") ? ["nothing"] : rawCurrentMarketing;
  const onlineProfiles = unique([
    ...list(order.social_links),
    ...list(deepDive.onlinePresence),
  ]);
  const products = productList(deepDive.majorProducts);

  const existingWebsite = existingText(base, "website_url");
  const auditWebsite = text(order.website_url);
  const lastSyncedWebsite = text(base.audit_synced_website_url);
  const customerOwnsWebsite = Boolean(existingWebsite && lastSyncedWebsite && existingWebsite !== lastSyncedWebsite);
  const existingProfiles = Array.isArray(base.online_profiles)
    ? unique(list(base.online_profiles))
    : [];
  const lastSyncedProfiles = Array.isArray(base.audit_synced_online_profiles)
    ? unique(list(base.audit_synced_online_profiles))
    : [];
  const customerOwnsProfiles = existingProfiles.length > 0
    && lastSyncedProfiles.length > 0
    && JSON.stringify(existingProfiles) !== JSON.stringify(lastSyncedProfiles);

  const businessName = text(order.business_name) || existingText(base, "business_name");
  const industry = text(order.industry) || existingText(base, "industry");
  const businessDescription = text(deepDive.businessDescription) || existingText(base, "business_description");
  const businessReach = text(deepDive.businessReach) || text(deepDive.geographicReach);
  const targetAudience = customerSegments.join(", ") || text(base.target_audience);
  const toneOfVoice = personality.join(", ") || text(base.tone_of_voice);
  const businessStage = text(deepDive.businessStage) || existingText(base, "business_stage") || "EARLY BUSINESS";

  const v1Experience = record(deepDive.v1Experience);
  const v1Profile = record(v1Experience.profile);
  const googleBusiness = deepDive.googleBusiness ?? v1Profile.googleBusiness ?? base.google_business;
  const reviews = deepDive.reviews ?? v1Profile.reviews ?? base.reviews;

  return {
    ...base,
    schema_version: "audit_brand_brain_v1",
    source: "paid_audit_intake",
    audit_order_id: text(order.id) || undefined,
    audit_intake_updated_at: text(intakeMeta.updatedAt) || undefined,
    business_name: businessName || undefined,
    industry: industry || undefined,
    business_description: businessDescription || undefined,
    business_reach: businessReach || undefined,
    business_stage: businessStage || undefined,
    location: businessReach === "online_anywhere" ? undefined : text(deepDive.location) || undefined,
    website_url: customerOwnsWebsite ? existingWebsite : (auditWebsite || existingWebsite) || undefined,
    audit_synced_website_url: auditWebsite || lastSyncedWebsite || undefined,
    online_profiles: customerOwnsProfiles ? existingProfiles : unique([...onlineProfiles, ...existingProfiles]),
    audit_synced_online_profiles: onlineProfiles,
    google_business: googleBusiness ?? undefined,
    reviews: reviews ?? undefined,
    products: products.length > 0 ? products : base.products,
    priority_offering: text(deepDive.priorityOffering) || undefined,
    target_audience: targetAudience || undefined,
    customer_segments: customerSegments,
    customer_age_groups: unique(list(deepDive.customerAgeGroups)),
    reasons_customers_choose_us: reasonsChosen,
    differentiation: reasonsChosen.join(", ") || existingText(base, "differentiation") || undefined,
    average_customer_spend: text(deepDive.averageSpend) || text(deepDive.pricingRange) || undefined,
    discovery_channels: discoveryChannels,
    purchase_channels: purchaseChannels,
    biggest_business_problem: text(deepDive.biggestProblem) || text(deepDive.currentProblems) || undefined,
    growth_priority: text(goals.primaryGoal) || text(goals.topPriorities) || undefined,
    ninety_day_success: text(goals.successDefinition) || undefined,
    competitors: unique(list(deepDive.competitors)),
    current_marketing: currentMarketing,
    best_customer_source: text(deepDive.bestCustomerSource) || undefined,
    previous_attempts: text(goals.triedAlready) || undefined,
    brand_personality: personality,
    tone_of_voice: toneOfVoice || undefined,
    additional_notes: text(goals.additionalNotes) || undefined,
    audit_intake: {
      businessDescription: text(deepDive.businessDescription),
      businessReach: text(deepDive.businessReach),
      businessStage: businessStage,
      location: businessReach === "online_anywhere" ? "" : text(deepDive.location),
      majorProducts: text(deepDive.majorProducts),
      priorityOffering: text(deepDive.priorityOffering),
      customerSegments,
      customerAgeGroups: unique(list(deepDive.customerAgeGroups)),
      reasonsChosen,
      averageSpend: text(deepDive.averageSpend),
      discoveryChannels,
      purchaseChannels,
      biggestProblem: text(deepDive.biggestProblem),
      primaryGoal: text(goals.primaryGoal),
      successDefinition: text(goals.successDefinition),
      competitors: unique(list(deepDive.competitors)),
      currentMarketing,
      bestCustomerSource: text(deepDive.bestCustomerSource),
      triedAlready: text(goals.triedAlready),
      brandPersonality: personality,
      additionalNotes: text(goals.additionalNotes),
    },
  };
}

/**
 * A failed/retried final transition must reuse the Brand Brain already built
 * from the same persisted intake rather than create another version.
 */
export function isBrandBrainCurrentForAudit(
  order: AuditIntakeBrandBrainSource,
  content: BrandBrainContent,
): boolean {
  const orderId = text(order.id);
  const intakeMeta = record(record(order.deep_dive_answers).intakeMeta);
  const intakeUpdatedAt = text(intakeMeta.updatedAt);
  return Boolean(
    orderId
    && intakeUpdatedAt
    && content.audit_order_id === orderId
    && content.audit_intake_updated_at === intakeUpdatedAt,
  );
}

export function brandBrainPresenceChanged(
  existing: BrandBrainContent | null,
  next: BrandBrainContent,
): boolean {
  const current = existing ?? {};
  return text(current.website_url) !== text(next.website_url)
    || JSON.stringify(current.online_profiles ?? []) !== JSON.stringify(next.online_profiles ?? [])
    || text(current.business_name) !== text(next.business_name);
}
