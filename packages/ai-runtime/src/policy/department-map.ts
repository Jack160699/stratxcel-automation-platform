import type { AITaskClass } from "../types.ts";
import { DEPARTMENT_KEYS } from "./department-keys.ts";

/**
 * Explicit department → default task-class mapping (25/25).
 * Task-level overrides may narrow; never silently default to Sol.
 */
export const DEPARTMENT_POLICY_MAP: Record<(typeof DEPARTMENT_KEYS)[number], AITaskClass> = {
  executive: "EXECUTIVE",
  strategy: "STRATEGY",
  research: "RESEARCH",
  brand: "CONTENT_STRATEGY",
  creative: "CREATIVE_TEXT",
  content: "CONTENT",
  media: "IMAGE",
  social: "GENERAL_SPECIALIST",
  seo: "SEO_RESEARCH",
  website: "WEBSITE_ENGINEERING",
  advertising: "STRATEGY",
  growth: "STRATEGY",
  sales: "SALES_CONVERSION",
  crm: "GENERAL_SPECIALIST",
  whatsapp: "GENERAL_SPECIALIST",
  conversion: "SALES_CONVERSION",
  analytics: "ANALYTICS",
  reporting: "REPORTING",
  optimization: "STRATEGY",
  quality: "BRAND_TRUST",
  compliance: "BRAND_TRUST",
  customer_success: "GENERAL_SPECIALIST",
  operations: "GENERAL_SPECIALIST",
  engineering: "WEBSITE_ENGINEERING",
  finance: "ANALYTICS",
};

/** Task-aware refinements within a department. */
export function resolveDepartmentTaskClass(
  department: string,
  hint?: "operations" | "creation" | "strategy" | "media" | "brand_trust" | "ad_copy",
): AITaskClass {
  const key = department.toLowerCase().replace(/\s+/g, "_");
  if (!(key in DEPARTMENT_POLICY_MAP)) {
    return "GENERAL_SPECIALIST";
  }
  const base = DEPARTMENT_POLICY_MAP[key as keyof typeof DEPARTMENT_POLICY_MAP];

  if (key === "social") {
    if (hint === "creation") return "CONTENT";
    if (hint === "strategy") return "STRATEGY";
    return "GENERAL_SPECIALIST";
  }
  if (key === "brand" && hint === "brand_trust") return "BRAND_TRUST";
  if (key === "advertising") {
    if (hint === "ad_copy" || hint === "creation") return "CONTENT";
    if (hint === "media") return "IMAGE";
    return "STRATEGY";
  }
  if (key === "media" && hint === "creation") return "VIDEO";
  if (key === "optimization" && hint === "operations") return "ANALYTICS";
  if (key === "finance" && hint === "operations") return "GENERAL_SPECIALIST";
  return base;
}

export function assertAllDepartmentsMapped(): { total: number; missing: string[] } {
  const missing = DEPARTMENT_KEYS.filter((k) => !(k in DEPARTMENT_POLICY_MAP));
  return { total: DEPARTMENT_KEYS.length, missing };
}
