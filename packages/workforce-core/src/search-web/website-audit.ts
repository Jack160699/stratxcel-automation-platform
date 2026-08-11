import { assertTenantScope } from "./capability-gate.ts";
import type { ConversionFinding, WebsiteAudit } from "./types.ts";

export function buildWebsiteAudit(input: {
  trustedTenantId: string;
  siteTenantId: string;
  propertyUrl: string;
  pages: readonly {
    url: string;
    strength?: "strong" | "weak" | "unknown";
    title?: string;
  }[];
  conversionFindings?: readonly ConversionFinding[];
}): WebsiteAudit {
  assertTenantScope(input.trustedTenantId, input.siteTenantId);

  const strongPages = input.pages.filter((p) => p.strength === "strong").map((p) => p.url);
  const weakPages = input.pages.filter((p) => p.strength === "weak").map((p) => p.url);
  const conversionFindingsConsumed = (input.conversionFindings ?? []).map((f) => f.code);

  const recommendations: string[] = [];
  if (weakPages.length) {
    recommendations.push(`Targeted improvements for weak pages: ${weakPages.join(", ")}`);
  }
  for (const finding of input.conversionFindings ?? []) {
    recommendations.push(`Conversion: ${finding.summary}`);
  }
  if (strongPages.length) {
    recommendations.push(`Preserve strong pages unchanged: ${strongPages.join(", ")}`);
  }
  recommendations.push("Do not redesign entire site for isolated weak pages");

  return {
    kind: "website_audit",
    id: `website_audit_${crypto.randomUUID()}`,
    tenantId: input.trustedTenantId,
    propertyUrl: input.propertyUrl,
    strongPages,
    weakPages,
    conversionFindingsConsumed,
    redesignEntireSite: false,
    preserveStrongPages: true,
    recommendations,
  };
}
