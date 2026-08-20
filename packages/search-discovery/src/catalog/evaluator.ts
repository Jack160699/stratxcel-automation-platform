import type { CanonicalActionType } from "./types.ts";
import { getActionDefinition } from "./registry.ts";

export interface CrawlerIssueFinding {
  issueCode: string;
  url: string;
  currentValue?: string;
  pageTitle?: string;
  primaryService?: string;
  businessName?: string;
}

export interface TechnicalFixProposal {
  actionType: CanonicalActionType;
  targetUrl: string;
  currentValue?: string;
  proposedValue: string;
  autonomyClass: string;
  verificationMethod: string;
}

export function evaluateTechnicalAutoFix(finding: CrawlerIssueFinding): TechnicalFixProposal | null {
  const biz = finding.businessName || "Business";
  const srv = finding.primaryService || "Services";

  if (finding.issueCode === "MISSING_TITLE") {
    const def = getActionDefinition("FIX_MISSING_TITLE");
    return {
      actionType: "FIX_MISSING_TITLE",
      targetUrl: finding.url,
      currentValue: "",
      proposedValue: `${srv} | ${biz}`,
      autonomyClass: def.autonomyClass,
      verificationMethod: def.verificationMethod,
    };
  }

  if (finding.issueCode === "MISSING_META_DESCRIPTION") {
    const def = getActionDefinition("FIX_MISSING_META_DESCRIPTION");
    return {
      actionType: "FIX_MISSING_META_DESCRIPTION",
      targetUrl: finding.url,
      currentValue: "",
      proposedValue: `Discover professional ${srv.toLowerCase()} at ${biz}. High quality care, transparent pricing, and expert staff. Contact us today.`,
      autonomyClass: def.autonomyClass,
      verificationMethod: def.verificationMethod,
    };
  }

  if (finding.issueCode === "TITLE_TOO_LONG" && finding.currentValue) {
    const def = getActionDefinition("FIX_TITLE_LENGTH");
    const trimmed = finding.currentValue.slice(0, 55).trim();
    return {
      actionType: "FIX_TITLE_LENGTH",
      targetUrl: finding.url,
      currentValue: finding.currentValue,
      proposedValue: `${trimmed}...`,
      autonomyClass: def.autonomyClass,
      verificationMethod: def.verificationMethod,
    };
  }

  return null;
}

export type ContentRefreshDecision = "NO_ACTION" | "REFRESH" | "EXPAND" | "RESTRUCTURE" | "NEW_PAGE";

export function evaluateContentRefreshDecision(input: {
  url: string;
  rankingDelta: number; // e.g. -4 positions
  daysSinceLastUpdate: number;
  wordCount: number;
  competitorWordCount: number;
}): { decision: ContentRefreshDecision; rationale: string; actionType?: CanonicalActionType } {
  // If ranking dropped significantly and word count is thin compared to competitor
  if (input.rankingDelta <= -3 && input.wordCount < 400 && input.competitorWordCount > 800) {
    return {
      decision: "EXPAND",
      rationale: `Page ranking dropped by ${Math.abs(input.rankingDelta)} positions. Content is thin (${input.wordCount} words vs competitor ${input.competitorWordCount} words).`,
      actionType: "EXPAND_THIN_PAGE",
    };
  }

  // If content is simply outdated (>180 days old and slipping)
  if (input.rankingDelta <= -2 && input.daysSinceLastUpdate > 180) {
    return {
      decision: "REFRESH",
      rationale: `Content has not been updated in ${input.daysSinceLastUpdate} days and experienced mild ranking decay.`,
      actionType: "REFRESH_OUTDATED_PAGE",
    };
  }

  // If page is stable or holding top position
  return {
    decision: "NO_ACTION",
    rationale: "Page performance is stable or holding top ranking positions. No mutation required.",
  };
}
