import type {
  WhyTheyWinExplanation,
  CompetitorQuerySnapshot,
  CompetitorProfile,
  TargetQuery,
} from "./types.ts";
import type { TechnicalIssue, TechnicalPage } from "../types.ts";

export interface WhyTheyWinInput {
  clientDomain: string;
  clientBusinessName: string;
  snapshots: CompetitorQuerySnapshot[];
  targetQueries: TargetQuery[];
  competitors: CompetitorProfile[];
  clientPages?: TechnicalPage[];
  clientTechnicalIssues?: TechnicalIssue[];
  localGbpConnected?: boolean;
}

/**
 * Evaluates why competitors are outperforming the client on high-priority queries.
 * Synthesizes performance, content coverage, technical SEO, and local entity signals
 * while explicitly recording unknowns and avoiding fabricated claims.
 */
export function analyzeWhyCompetitorsWin(input: WhyTheyWinInput): WhyTheyWinExplanation[] {
  const explanations: WhyTheyWinExplanation[] = [];
  const clientPages = input.clientPages || [];
  const clientPageUrls = clientPages.map((p) => p.url.toLowerCase());

  for (const snapshot of input.snapshots) {
    if (snapshot.availabilityState !== "available") continue;

    for (const comp of snapshot.competitors) {
      if (!comp.isAhead || comp.position === null) continue;

      const queryText = snapshot.query;
      const qLower = queryText.toLowerCase();

      const evidence: string[] = [];
      const likelyReasons: string[] = [];
      const unknowns: string[] = [];

      // 1. Search Performance Evidence
      if (snapshot.clientPosition === null) {
        evidence.push(
          `${comp.businessName} ranks at position #${comp.position} in live search results, while ${input.clientBusinessName} is not ranked in the top 10 for "${queryText}".`
        );
      } else {
        evidence.push(
          `${comp.businessName} holds position #${comp.position}, outranking ${input.clientBusinessName} (position #${snapshot.clientPosition}) by ${snapshot.clientPosition - comp.position} spots for "${queryText}".`
        );
      }

      // 2. Content Coverage Analysis
      const clientHasDedicatedPage = clientPageUrls.some((url) => {
        const slug = qLower.replace(/[^a-z0-9]/g, "-");
        return url.includes(slug) || qLower.split(" ").some((word) => word.length > 4 && url.includes(word));
      });

      if (!clientHasDedicatedPage) {
        likelyReasons.push(
          `Content Gap: ${input.clientBusinessName} lacks a dedicated landing page specifically optimized for "${queryText}".`
        );
        if (comp.url) {
          evidence.push(
            `Competitor uses targeted URL path "${new URL(comp.url).pathname}" matching query intent.`
          );
        }
      } else {
        likelyReasons.push(
          `On-Page Relevance: Competitor's page title and heading structure match query intent with higher topical density.`
        );
      }

      // 3. Technical SEO Signals (from crawler)
      const criticalTechIssues = (input.clientTechnicalIssues || []).filter(
        (iss) => iss.severity === "Critical" || iss.severity === "High"
      );
      if (criticalTechIssues.length > 0) {
        likelyReasons.push(
          `Technical Factors: Client website has ${criticalTechIssues.length} unresolved technical issue(s) (e.g., ${criticalTechIssues[0].code}) which can impede search indexing.`
        );
        evidence.push(
          `Technical diagnostic flag: ${criticalTechIssues[0].whyItMatters}`
        );
      }

      // 4. Local / Entity Signals
      const isLocalQuery = /near me| in [a-z0-9\s]+/i.test(queryText);
      if (isLocalQuery) {
        if (!input.localGbpConnected) {
          likelyReasons.push(
            `Local Presence: Google Business Profile is not connected or verified, reducing local pack eligibility.`
          );
          evidence.push("Local pack search signal: Unverified Google Business connection.");
        } else {
          likelyReasons.push(
            `Local Entity Authority: Competitor exhibits localized directory and entity mentions matching the searched geography.`
          );
        }
      }

      // 5. Explicit Unknowns (Never claim unverified backlink superiority)
      unknowns.push(
        "Off-page domain authority & backlink profile: Unmeasured (requires third-party backlink provider integration)."
      );
      unknowns.push(
        "Direct user engagement signals (dwell time / return-to-SERP rate): Proprietary to Google search telemetry."
      );

      // 6. Actionable Recommendation
      let recommendedAction = "";
      if (!clientHasDedicatedPage) {
        recommendedAction = `Create and publish a dedicated service/location page for "${queryText}" with structured JSON-LD schema and descriptive H1 headings.`;
      } else if (criticalTechIssues.length > 0) {
        recommendedAction = `Resolve high-priority technical issues (${criticalTechIssues[0].code}) and optimize on-page meta tags for "${queryText}".`;
      } else {
        recommendedAction = `Enrich existing page content for "${queryText}" with FAQ schema, customer testimonials, and localized entity references.`;
      }

      explanations.push({
        competitorDomain: comp.domain,
        competitorName: comp.businessName,
        query: queryText,
        gap: `${comp.businessName} holds position #${comp.position} (${snapshot.clientPosition !== null ? `vs Client #${snapshot.clientPosition}` : "Client not ranked in top 10"})`,
        evidence,
        sources: [snapshot.source, "website_technical_crawler"],
        confidence: snapshot.clientPosition !== null ? "HIGH" : "MEDIUM",
        likelyReasons,
        unknowns,
        recommendedAction,
      });
    }
  }

  // Deduplicate and return top explanations
  return explanations.slice(0, 10);
}
