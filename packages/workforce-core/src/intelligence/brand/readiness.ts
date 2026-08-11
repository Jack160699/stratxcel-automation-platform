import type { BrandBrainContent } from "@stratxcel/brand-brain";
import type { BrandReadinessAssessment, BrandReadinessLevel } from "../types.ts";

const REQUIRED = ["business_name", "tone_of_voice", "target_audience"] as const;
const PROHIBITED = [/\bguaranteed\b/i, /\b\d+%\s*(roi|roas|conversion|growth)\b/i, /\b#1\b/i, /\bwill double\b/i, /\bmarket leader\b/i];

export class ProhibitedClaimError extends Error { constructor(m: string) { super(m); this.name = "ProhibitedClaimError"; } }

export function assessBrandReadiness(brandBrain: BrandBrainContent): BrandReadinessAssessment {
  const presentFields: string[] = []; const missingRequired: string[] = [];
  for (const f of REQUIRED) {
    const v = (brandBrain as Record<string, unknown>)[f];
    const ok =
      typeof v === "string"
        ? v.trim().length > 0
        : Array.isArray(v)
          ? v.length > 0
          : v != null;
    (ok ? presentFields : missingRequired).push(f);
  }
  const warnings: string[] = [];
  const products = (brandBrain as { products?: unknown }).products;
  if (!(Array.isArray(products) && products.length > 0) && !brandBrain.industry?.trim()) {
    warnings.push("Offer context missing — do not invent SKUs");
  }
  let level: BrandReadinessLevel = missingRequired.length === REQUIRED.length ? "MISSING_REQUIRED_CONTEXT" : missingRequired.length ? "PARTIAL" : "READY";
  const scan = JSON.stringify(brandBrain);
  return { level, presentFields, missingRequired, warnings, prohibitedClaimViolations: PROHIBITED.filter((rx) => rx.test(scan)).map((rx) => rx.source) };
}

export function assertNoProhibitedClaims(text: string): void {
  for (const rx of PROHIBITED) if (rx.test(text)) throw new ProhibitedClaimError(`prohibited_claim:${rx.source}`);
}
