/**
 * Edit Request Classifier & Risk Assessor
 *
 * Classifies natural-language edit requests into LOW, MEDIUM, or HIGH risk
 * categories and enforces confirmation gates for destructive actions.
 */

import type { RiskLevel, ChangeType } from "./types.ts";

export interface ClassifiedIntent {
  changeType: ChangeType;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  affectedAreas: string[];
  isSecurityViolation: boolean;
  securityViolationReason?: string;
}

export function classifyEditRequest(instruction: string): ClassifiedIntent {
  const norm = instruction.toLowerCase().trim();

  // 1. Security & Prompt Injection Guard
  if (
    norm.includes("ignore previous instructions") ||
    norm.includes("ignore all instructions") ||
    norm.includes("system prompt") ||
    norm.includes("reveal secrets") ||
    norm.includes("api_key") ||
    norm.includes("service_role") ||
    norm.includes("<script") ||
    norm.includes("javascript:")
  ) {
    return {
      changeType: "CustomInstruction",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      affectedAreas: ["security"],
      isSecurityViolation: true,
      securityViolationReason: "Prompt injection, script payload, or secret exfiltration attempt detected",
    };
  }

  // 2. HIGH Risk (Domain purchase/transfer, payment credentials, project deletion, unpublishing)
  const isHighRisk =
    norm.includes("delete website") ||
    norm.includes("remove website") ||
    norm.includes("destroy") ||
    norm.includes("change domain") ||
    norm.includes("transfer domain") ||
    norm.includes("change registrar") ||
    norm.includes("payment key") ||
    norm.includes("razorpay secret") ||
    norm.includes("refund") ||
    norm.includes("unpublish");

  if (isHighRisk) {
    return {
      changeType: "CustomInstruction",
      riskLevel: "HIGH",
      requiresConfirmation: true,
      affectedAreas: ["domain", "billing", "project_lifecycle"],
      isSecurityViolation: false,
    };
  }

  // 3. MEDIUM Risk (Adding/Removing pages, product/pricing alterations, navigation modifications)
  const isAddPage = norm.includes("add page") || norm.includes("add an about page") || norm.includes("add pricing page") || norm.includes("add contact page");
  const isRemovePage = norm.includes("remove page") || norm.includes("delete page") || norm.includes("drop page");
  const isProductEdit = norm.includes("product") || norm.includes("price") || norm.includes("pricing") || norm.includes("collection") || norm.includes("catalog");
  const isNavEdit = norm.includes("navigation") || norm.includes("menu") || norm.includes("navbar");
  const isSectionRemove = norm.includes("remove section") || norm.includes("delete section");

  if (isAddPage) {
    return { changeType: "AddPage", riskLevel: "MEDIUM", requiresConfirmation: false, affectedAreas: ["pages", "navigation"], isSecurityViolation: false };
  }
  if (isRemovePage) {
    return { changeType: "RemovePage", riskLevel: "MEDIUM", requiresConfirmation: false, affectedAreas: ["pages", "navigation"], isSecurityViolation: false };
  }
  if (isProductEdit) {
    return { changeType: "UpdateProduct", riskLevel: "MEDIUM", requiresConfirmation: false, affectedAreas: ["ecommerce", "products"], isSecurityViolation: false };
  }
  if (isNavEdit) {
    return { changeType: "UpdateNavigation", riskLevel: "MEDIUM", requiresConfirmation: false, affectedAreas: ["navigation"], isSecurityViolation: false };
  }
  if (isSectionRemove) {
    return { changeType: "UpdateSection", riskLevel: "MEDIUM", requiresConfirmation: false, affectedAreas: ["sections"], isSecurityViolation: false };
  }

  // 4. LOW Risk (Copy edits, design/aesthetic changes, colors, spacing, typography, SEO, image replacements)
  if (norm.includes("seo") || norm.includes("meta description") || norm.includes("meta title")) {
    return { changeType: "UpdateSEO", riskLevel: "LOW", requiresConfirmation: false, affectedAreas: ["seo"], isSecurityViolation: false };
  }
  if (norm.includes("image") || norm.includes("hero image") || norm.includes("photo") || norm.includes("logo")) {
    return { changeType: "UpdateAsset", riskLevel: "LOW", requiresConfirmation: false, affectedAreas: ["assets", "images"], isSecurityViolation: false };
  }
  if (
    norm.includes("color") ||
    norm.includes("luxurious") ||
    norm.includes("luxury") ||
    norm.includes("darker") ||
    norm.includes("minimal") ||
    norm.includes("typography") ||
    norm.includes("font") ||
    norm.includes("button") ||
    norm.includes("spacing") ||
    norm.includes("whitespace")
  ) {
    return { changeType: "UpdateDesign", riskLevel: "LOW", requiresConfirmation: false, affectedAreas: ["visualStyle", "designSystem"], isSecurityViolation: false };
  }

  return {
    changeType: "UpdateContent",
    riskLevel: "LOW",
    requiresConfirmation: false,
    affectedAreas: ["content", "copy"],
    isSecurityViolation: false,
  };
}
