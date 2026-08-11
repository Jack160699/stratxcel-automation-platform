import type { BusinessGrowthPlannerInput } from "./types.ts";
import type {
  BusinessGrowthDiagnosis,
  BusinessGrowthDiagnosisFinding,
  CustomerEntryMode,
  GrowthBottleneck,
  GrowthBottleneckCode,
} from "./growth-types.ts";

export function resolveEntryMode(input: BusinessGrowthPlannerInput): CustomerEntryMode {
  if (input.entryMode) return input.entryMode;

  const purchased = input.entitlementSnapshot.purchasedServiceKeys ?? [];
  const auditOnly =
    purchased.includes("brand_audit") ||
    purchased.includes("business_growth_audit") ||
    (purchased.length > 0 && purchased.every((k) => k.includes("audit")));

  const hasSocialPackage =
    (input.entitlementSnapshot.relevantEntitlements.social_posts ?? 0) > 0 ||
    input.entitlementSnapshot.packageComposition.length > 0;

  if (auditOnly && !hasSocialPackage) return "AUDIT_ONLY";

  const signals = input.businessSignals;
  const isNew =
    signals?.hasWebsite === false &&
    signals?.socialPresenceStrength === "none" &&
    !signals?.hasAds &&
    input.connectedChannels.length === 0;

  if (isNew) return "NEW_BUSINESS";
  if (hasSocialPackage) return "ACTIVE_PACKAGE_CUSTOMER";
  if (signals && (signals.monthlyInquiries != null || signals.websiteTrafficStrength)) {
    return "EXISTING_BUSINESS";
  }
  return "EXISTING_BUSINESS";
}

function finding(partial: BusinessGrowthDiagnosisFinding): BusinessGrowthDiagnosisFinding {
  return partial;
}

/**
 * Evidence-gated diagnosis. Never invents competitor stats or performance numbers.
 * Signals without evidenceIds are treated as ASSUMPTION / RESEARCH_REQUIRED.
 */
export function diagnoseBusinessGrowth(input: BusinessGrowthPlannerInput): BusinessGrowthDiagnosis {
  const entryMode = resolveEntryMode(input);
  const signals = input.businessSignals ?? {};
  const evidence = signals.signalEvidenceIds ?? input.existingResearchEvidence;
  const hasEvidence = evidence.length > 0;
  const findings: BusinessGrowthDiagnosisFinding[] = [];
  const researchGaps: string[] = [];
  const strongestAssets: string[] = [];

  const brandName = input.brandBrain.business_name;
  if (brandName) {
    findings.push(
      finding({
        domain: "brand",
        finding: `Brand Brain identifies business as ${brandName}`,
        status: "KNOWN",
        severity: "info",
        opportunityLevel: "none",
        confidence: "high",
        evidenceIds: ["brand_brain"],
        businessImpact: "Grounds all customer-facing work in approved brand context",
        recommendedActionClass: "preserve_brand_grounding",
      }),
    );
    strongestAssets.push("Approved Brand Brain context");
  } else {
    researchGaps.push("Brand Brain incomplete — business identity needs confirmation");
    findings.push(
      finding({
        domain: "brand",
        finding: "Brand identity incompletely specified",
        status: "RESEARCH_REQUIRED",
        severity: "medium",
        opportunityLevel: "medium",
        confidence: "medium",
        evidenceIds: [],
        businessImpact: "Risk of off-brand or generic positioning",
        recommendedActionClass: "complete_brand_brain",
      }),
    );
  }

  if (input.positioning?.trim()) {
    findings.push(
      finding({
        domain: "market_positioning",
        finding: `Positioning context: ${input.positioning}`,
        status: "KNOWN",
        severity: "info",
        opportunityLevel: "low",
        confidence: "medium",
        evidenceIds: ["positioning_context"],
        businessImpact: "Guides messaging without inventing market facts",
        recommendedActionClass: "align_messaging",
      }),
    );
  }

  // Website / traffic
  if (signals.hasWebsite === false) {
    findings.push(
      finding({
        domain: "website",
        finding: "No website present",
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "high",
        opportunityLevel: "high",
        confidence: hasEvidence ? "high" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Missing digital foundation for discovery and conversion",
        recommendedActionClass: "website_foundation",
      }),
    );
  } else if (signals.websiteTrafficStrength === "high") {
    strongestAssets.push("Strong website traffic");
    findings.push(
      finding({
        domain: "website",
        finding: "Website traffic strength reported as high",
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "info",
        opportunityLevel: "low",
        confidence: hasEvidence ? "high" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Traffic system may already work — avoid unnecessary rebuild",
        recommendedActionClass: "preserve_working_traffic",
      }),
    );
  } else if (signals.websiteTrafficStrength === "low" || signals.searchVisibilityStrength === "low") {
    findings.push(
      finding({
        domain: "search_seo",
        finding: "Search/website discovery appears weak",
        status: hasEvidence ? "DERIVED" : "RESEARCH_REQUIRED",
        severity: "medium",
        opportunityLevel: "high",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Designed to improve qualified discovery if addressed",
        recommendedActionClass: "improve_discovery",
      }),
    );
  }

  if (signals.socialPresenceStrength === "high" || signals.socialPresenceStrength === "medium") {
    strongestAssets.push("Existing social presence");
    findings.push(
      finding({
        domain: "social_presence",
        finding: `Social presence strength: ${signals.socialPresenceStrength}`,
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "info",
        opportunityLevel: "low",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Social may already contribute — do not default to more posts",
        recommendedActionClass: "preserve_or_optimize_social",
      }),
    );
  } else if (signals.socialPresenceStrength === "none") {
    findings.push(
      finding({
        domain: "social_presence",
        finding: "No social presence reported",
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: entryMode === "NEW_BUSINESS" ? "medium" : "low",
        opportunityLevel: "medium",
        confidence: hasEvidence ? "high" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Channel setup may be needed before social execution",
        recommendedActionClass: "channel_setup_or_defer",
      }),
    );
  }

  if (typeof signals.monthlyInquiries === "number" && signals.monthlyInquiries >= 100) {
    strongestAssets.push("Substantial inquiry volume");
    findings.push(
      finding({
        domain: "lead_capture",
        finding: `Reported inquiry volume approximately ${signals.monthlyInquiries}/month`,
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "info",
        opportunityLevel: "none",
        confidence: hasEvidence ? "high" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Discovery may already work — prioritize response/conversion systems",
        recommendedActionClass: "preserve_demand_capture",
      }),
    );
  }

  if (typeof signals.medianResponseTimeHours === "number" && signals.medianResponseTimeHours >= 4) {
    findings.push(
      finding({
        domain: "whatsapp_response",
        finding: `Median lead response time reported at ~${signals.medianResponseTimeHours} hours`,
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "critical",
        opportunityLevel: "high",
        confidence: hasEvidence ? "high" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Slow response reduces the likelihood of converting existing demand",
        recommendedActionClass: "accelerate_response",
      }),
    );
  }

  if (signals.crmFollowUpStrength === "weak" || signals.crmFollowUpStrength === "none") {
    findings.push(
      finding({
        domain: "crm",
        finding: "CRM follow-up reported as weak or absent",
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "high",
        opportunityLevel: "high",
        confidence: hasEvidence ? "high" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Addresses leakage after inquiry — supports conversion likelihood",
        recommendedActionClass: "strengthen_follow_up",
      }),
    );
  }

  if (signals.postContactConversionStrength === "high" || signals.postContactConversionStrength === "medium") {
    strongestAssets.push("Healthy post-contact conversion");
    findings.push(
      finding({
        domain: "conversion",
        finding: "Post-contact conversion reported as healthy",
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "info",
        opportunityLevel: "none",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Do not rebuild the sales close path unnecessarily",
        recommendedActionClass: "preserve_conversion_path",
      }),
    );
  }

  if (signals.leadCaptureStrength === "weak" || signals.leadCaptureStrength === "none") {
    findings.push(
      finding({
        domain: "lead_capture",
        finding: "Lead capture reported as weak or missing",
        status: hasEvidence ? "KNOWN" : "RESEARCH_REQUIRED",
        severity: "high",
        opportunityLevel: "high",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Traffic without capture wastes discovery effort",
        recommendedActionClass: "improve_lead_capture",
      }),
    );
  }

  if (signals.analyticsAttributionStrength === "weak" || signals.analyticsAttributionStrength === "none") {
    findings.push(
      finding({
        domain: "analytics_attribution",
        finding: "Attribution/measurement reported as weak",
        status: hasEvidence ? "KNOWN" : "RESEARCH_REQUIRED",
        severity: "medium",
        opportunityLevel: "medium",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Limits learning and optimization quality",
        recommendedActionClass: "improve_measurement",
      }),
    );
  }


  // Discovery / demand — only when conversion systems are not the primary leak
  const conversionHealthy =
    signals.postContactConversionStrength === "high" ||
    signals.postContactConversionStrength === "medium" ||
    signals.leadCaptureStrength === "adequate" ||
    signals.leadCaptureStrength === "strong";
  const responseOk =
    typeof signals.medianResponseTimeHours !== "number" || signals.medianResponseTimeHours < 4;
  const followUpOk =
    signals.crmFollowUpStrength !== "weak" && signals.crmFollowUpStrength !== "none";

  if (
    conversionHealthy &&
    responseOk &&
    followUpOk &&
    (signals.websiteTrafficStrength === "low" || signals.websiteTrafficStrength === "none") &&
    (signals.searchVisibilityStrength === "low" ||
      signals.searchVisibilityStrength === "none" ||
      signals.socialPresenceStrength === "none" ||
      signals.socialPresenceStrength === "low")
  ) {
    findings.push(
      finding({
        domain: "paid_acquisition",
        finding: "Conversion foundation appears healthier than discovery — demand creation may be the bottleneck",
        status: hasEvidence ? "DERIVED" : "RESEARCH_REQUIRED",
        severity: "medium",
        opportunityLevel: "high",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact:
          "Paid acquisition may be considered as one lever after readiness checks — not mandatory and never uncontrolled spend",
        recommendedActionClass: "evaluate_paid_acquisition_readiness",
      }),
    );
  }

  if (signals.hasAds === true) {
    findings.push(
      finding({
        domain: "paid_acquisition",
        finding: "Business reports existing ads activity — Stratxcel remains planning-only until Marketing API + approvals exist",
        status: hasEvidence ? "KNOWN" : "ASSUMPTION",
        severity: "info",
        opportunityLevel: "low",
        confidence: hasEvidence ? "medium" : "low",
        evidenceIds: hasEvidence ? evidence : [],
        businessImpact: "Existing spend is outside Stratxcel control; plans do not authorize additional spend",
        recommendedActionClass: "plan_ads_without_spend",
      }),
    );
  }

  if (input.connectedChannels.length === 0) {
    findings.push(
      finding({
        domain: "social_presence",
        finding: "No connected social channels in Stratxcel",
        status: "KNOWN",
        severity: "medium",
        opportunityLevel: "medium",
        confidence: "high",
        evidenceIds: ["integration_state"],
        businessImpact: "Social execution cannot run until channels are connected",
        recommendedActionClass: "SETUP_REQUIRED",
      }),
    );
  }

  if (!hasEvidence && entryMode !== "ACTIVE_PACKAGE_CUSTOMER") {
    researchGaps.push("External market/competitor/performance claims require research evidence");
  }

  const executiveSummary =
    entryMode === "NEW_BUSINESS"
      ? "New business: prioritize digital foundation before channel scale."
      : entryMode === "AUDIT_ONLY"
        ? "Audit-only engagement: diagnose, prioritize, and recommend — do not execute unpurchased work."
        : strongestAssets.length > 0
          ? `Existing assets include: ${strongestAssets.join("; ")}. Focus on highest-impact bottlenecks.`
          : "Diagnose with available evidence; mark research gaps explicitly.";

  return {
    entryMode,
    executiveSummary,
    strongestAssets,
    findings,
    researchGaps,
    generatedAtIso: input.currentDateIso,
  };
}

export function deriveBottlenecks(diagnosis: BusinessGrowthDiagnosis): GrowthBottleneck[] {
  const bottlenecks: GrowthBottleneck[] = [];
  let n = 0;

  const push = (
    code: GrowthBottleneckCode,
    domain: GrowthBottleneck["domain"],
    description: string,
    f: BusinessGrowthDiagnosisFinding,
    priorityScore: number,
  ) => {
    bottlenecks.push({
      id: `bn_${++n}`,
      code,
      domain,
      description,
      evidenceIds: f.evidenceIds,
      severity: f.severity,
      estimatedImpactClass: f.opportunityLevel === "high" ? "high" : f.opportunityLevel === "medium" ? "medium" : "low",
      confidence: f.confidence,
      upstreamDependencies: [],
      downstreamEffects: [f.businessImpact],
      priorityScore,
      status: "open",
    });
  };

  for (const f of diagnosis.findings) {
    if (f.opportunityLevel === "none" || f.severity === "info") continue;
    if (f.domain === "whatsapp_response" && f.recommendedActionClass === "accelerate_response") {
      push("SLOW_LEAD_RESPONSE", "whatsapp_response", f.finding, f, 95);
    } else if (f.domain === "crm" && f.recommendedActionClass === "strengthen_follow_up") {
      push("WEAK_FOLLOW_UP", "crm", f.finding, f, 90);
    } else if (f.domain === "lead_capture") {
      push("POOR_LEAD_CAPTURE", "lead_capture", f.finding, f, 85);
    } else if (f.domain === "website" && f.recommendedActionClass === "website_foundation") {
      push("MISSING_DIGITAL_FOUNDATION", "website", f.finding, f, 88);
    } else if (f.domain === "website" && f.recommendedActionClass === "improve_lead_capture") {
      push("WEAK_WEBSITE_CONVERSION", "website", f.finding, f, 80);
    } else if (f.domain === "search_seo") {
      push("WEAK_SEARCH_VISIBILITY", "search_seo", f.finding, f, 75);
    } else if (f.domain === "paid_acquisition" && f.recommendedActionClass === "evaluate_paid_acquisition_readiness") {
      push("LOW_DISCOVERY", "paid_acquisition", f.finding, f, 70);
      push("INSUFFICIENT_DEMAND", "paid_acquisition", f.finding, f, 68);
    } else if (f.domain === "social_presence" && f.opportunityLevel === "high") {
      push("LOW_DISCOVERY", "social_presence", f.finding, f, 60);
    } else if (f.domain === "analytics_attribution") {
      push("MISSING_ATTRIBUTION", "analytics_attribution", f.finding, f, 55);
    } else if (f.severity === "high" || f.severity === "critical") {
      push("CUSTOM", f.domain, f.finding, f, 50);
    }
  }

  return bottlenecks.sort((a, b) => b.priorityScore - a.priorityScore);
}

export function assertBottleneckEvidence(bottlenecks: readonly GrowthBottleneck[]): void {
  for (const b of bottlenecks) {
    if (b.confidence === "high" && b.evidenceIds.length === 0) {
      throw new Error(`bottleneck_missing_evidence:${b.id}`);
    }
  }
}
