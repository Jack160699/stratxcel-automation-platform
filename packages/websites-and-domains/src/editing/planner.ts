/**
 * Edit Planner
 *
 * Translates classified natural language edits into structured change operations
 * and descriptive change summary bullet points.
 */

import type { WebsiteChange, StructuredOperation, ChangeType, RiskLevel } from "./types.ts";
import { classifyEditRequest } from "./classifier.ts";

export interface PlanEditInput {
  tenantId: string;
  projectId: string;
  instruction: string;
  baseVersion: number;
}

export function planEdit(input: PlanEditInput): WebsiteChange {
  const intent = classifyEditRequest(input.instruction);
  const changeId = `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const norm = input.instruction.toLowerCase().trim();

  const structuredOperations: StructuredOperation[] = [];
  const changeSummary: string[] = [];
  const affectedPages: string[] = ["home"];
  const affectedComponents: string[] = [];

  switch (intent.changeType) {
    case "AddPage":
      if (norm.includes("about")) {
        structuredOperations.push({
          op: "add",
          path: "$.pages",
          value: { slug: "about", title: "About Us" },
          description: "Add About Us page",
        });
        changeSummary.push("Added About Us page with brand heritage & story");
        affectedPages.push("about");
      } else if (norm.includes("pricing")) {
        structuredOperations.push({
          op: "add",
          path: "$.pages",
          value: { slug: "pricing", title: "Pricing Plans" },
          description: "Add Pricing page",
        });
        changeSummary.push("Added Pricing page with transparent tiers");
        affectedPages.push("pricing");
      } else {
        structuredOperations.push({
          op: "add",
          path: "$.pages",
          value: { slug: "custom-page", title: "New Page" },
          description: "Add new page",
        });
        changeSummary.push("Added new page to navigation");
      }
      break;

    case "RemovePage":
      structuredOperations.push({
        op: "remove",
        path: "$.pages",
        description: "Remove page from website specification",
      });
      changeSummary.push("Removed page from navigation and site structure");
      break;

    case "UpdateProduct":
      structuredOperations.push({
        op: "set",
        path: "$.ecommerce.products",
        description: "Update product catalog and pricing",
      });
      changeSummary.push("Updated product catalog and pricing configurations");
      affectedComponents.push("product-grid", "catalog");
      break;

    case "UpdateDesign":
      if (norm.includes("luxur") || norm.includes("darker")) {
        structuredOperations.push({
          op: "replace",
          path: "$.visualStyle.colorPalette.accent",
          value: "#C5A880",
          description: "Set luxury gold accent color",
        });
        structuredOperations.push({
          op: "replace",
          path: "$.visualStyle.typography.headingFont",
          value: "Playfair Display, serif",
          description: "Set luxury serif heading font",
        });
        changeSummary.push("Elevated aesthetic to luxury styling with champagne gold and serif typography");
      } else if (norm.includes("color") || norm.includes("button")) {
        structuredOperations.push({
          op: "set",
          path: "$.visualStyle.colorPalette",
          description: "Update color palette",
        });
        changeSummary.push("Updated brand color palette and button styling");
      } else {
        structuredOperations.push({
          op: "set",
          path: "$.visualStyle",
          description: "Refined visual styling and spacing",
        });
        changeSummary.push("Refined layout spacing and visual hierarchy");
      }
      affectedComponents.push("theme", "buttons", "cards");
      break;

    case "UpdateSEO":
      structuredOperations.push({
        op: "set",
        path: "$.seo",
        description: "Update SEO titles and meta descriptions",
      });
      changeSummary.push("Optimized SEO title tags and meta descriptions");
      break;

    case "UpdateAsset":
      structuredOperations.push({
        op: "set",
        path: "$.assets",
        description: "Update imagery and asset references",
      });
      changeSummary.push("Updated hero photography and asset placement");
      affectedComponents.push("hero", "image-banner");
      break;

    case "UpdateContent":
    default:
      if (norm.includes("headline") || norm.includes("hero")) {
        structuredOperations.push({
          op: "replace",
          path: "$.pages[0].sections[0].heading",
          description: "Rewrite hero headline",
        });
        changeSummary.push("Updated homepage hero headline and subheadline");
      } else if (norm.includes("testimonial")) {
        structuredOperations.push({
          op: "add",
          path: "$.pages[0].sections",
          description: "Add testimonials section",
        });
        changeSummary.push("Added client testimonials & reviews section");
      } else if (norm.includes("faq")) {
        structuredOperations.push({
          op: "add",
          path: "$.pages[0].sections",
          description: "Add FAQ accordion section",
        });
        changeSummary.push("Added interactive FAQ section");
      } else {
        structuredOperations.push({
          op: "set",
          path: "$.pages[0].content",
          description: "Update section content",
        });
        changeSummary.push(`Applied content adjustment: ${input.instruction}`);
      }
      affectedComponents.push("hero", "sections");
      break;
  }

  return {
    changeId,
    projectId: input.projectId,
    tenantId: input.tenantId,
    baseVersion: input.baseVersion,
    changeType: intent.changeType,
    affectedPages,
    affectedComponents,
    requestedChange: input.instruction,
    structuredOperations,
    changeSummary,
    riskLevel: intent.riskLevel,
    requiresConfirmation: intent.requiresConfirmation,
    createdAt: new Date().toISOString(),
  };
}
