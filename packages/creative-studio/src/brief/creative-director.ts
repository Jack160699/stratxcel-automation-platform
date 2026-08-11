import type { CreativeBrief, CreativeBriefInput } from "../types.ts";

const GUARANTEED_RESULT_PATTERNS = [
  /\bguaranteed\s+(results?|roi|revenue|sales|leads?|growth)\b/i,
  /\bguarantee(d)?\s+\d+%\b/i,
  /\b100%\s+(guaranteed|success|roi)\b/i,
  /\bdouble\s+your\s+(roi|revenue|sales)\b/i,
  /\bguaranteed\s+roi\b/i,
];

function textBlob(parts: readonly (string | undefined)[]): string {
  return parts.filter(Boolean).join("\n");
}

/** Blocks guaranteed-results/ROI language and any prohibited claim substrings. */
export function assertClaimsAllowed(args: {
  text: string;
  approvedClaims?: readonly string[];
  prohibitedClaims?: readonly string[];
}): void {
  const lower = args.text.toLowerCase();

  for (const pattern of GUARANTEED_RESULT_PATTERNS) {
    if (pattern.test(args.text)) {
      throw new Error("blocked_claim:guaranteed_results_or_roi");
    }
  }

  for (const claim of args.prohibitedClaims ?? []) {
    if (claim && lower.includes(claim.toLowerCase())) {
      throw new Error(`blocked_claim:prohibited:${claim}`);
    }
  }
}

export function createCreativeBrief(input: CreativeBriefInput): CreativeBrief {
  const claimSurface = textBlob([
    input.businessObjective,
    input.positioning,
    input.researchSummary,
    input.campaignContext,
    ...(input.approvedClaims ?? []),
    ...(input.productFacts ?? []),
  ]);

  assertClaimsAllowed({
    text: claimSurface,
    approvedClaims: input.approvedClaims,
    prohibitedClaims: input.prohibitedClaims,
  });

  const id = `brief_${input.tenantId}_${input.missionId}_${Date.now().toString(36)}`;
  const mustAvoid = [
    ...(input.prohibitedClaims ?? []),
    "guaranteed results",
    "guaranteed ROI",
    "fabricated testimonials",
  ];

  return {
    id,
    tenantId: input.tenantId,
    missionId: input.missionId,
    singleMindedObjective: input.businessObjective.trim(),
    audienceInsight: input.audience.trim(),
    conceptSeed: `${input.funnelPurpose} for ${input.audience}`.trim(),
    hook: `What if ${input.audience} could move on ${input.businessObjective}?`,
    emotionalDirection: "confident, grounded, credible",
    visualDirection: input.qualityTarget ?? "clean product-led composition with brand-safe hierarchy",
    copyDirection: input.positioning ?? "clear benefit, proof, soft CTA",
    cta: input.funnelPurpose.toLowerCase().includes("aware") ? "Learn more" : "Get started",
    mustInclude: [
      ...(input.productFacts ?? []).slice(0, 5),
      ...(input.approvedClaims ?? []).slice(0, 5),
    ],
    mustAvoid,
    references: [...(input.referenceAssetIds ?? [])],
    brandConstraints: [...(input.brandConstraints ?? [])],
    platformConstraints: [`platform:${input.platform}`, `format:${input.format}`],
    qualityTarget: input.qualityTarget ?? "production-ready, on-brand, claim-safe",
    platform: input.platform,
    format: input.format,
    approvedClaims: [...(input.approvedClaims ?? [])],
    prohibitedClaims: [...(input.prohibitedClaims ?? [])],
    productFacts: [...(input.productFacts ?? [])],
    createdByDepartment: "creative",
    createdByRole: "creative_director",
  };
}
