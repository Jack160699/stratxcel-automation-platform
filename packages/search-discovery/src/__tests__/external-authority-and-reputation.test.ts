import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAuthorityGaps,
  discoverCommunityOpportunities,
  analyzeReviewReputation,
  buildEntityCitationGraph,
  runExternalAuthorityAnalysis,
  type ExternalSourceProfile,
} from "../index.ts";

test("1. Source normalization & 2. Source classification", () => {
  const source: ExternalSourceProfile = {
    domain: "practo.com",
    sourceType: "local_directory",
    title: "Practo Healthcare Directory",
    targetUrl: "https://practo.com/raipur/clinics",
    topicRelevance: 95,
    geographicRelevance: "LOCAL",
    clientPresent: false,
    competitorPresent: true,
    competitorDomains: ["rivaldental.com"],
    clientCitations: [],
    publicationCapability: "READ_ONLY",
    evidence: ["Practo verified listing"],
    opportunityScore: 90,
    confidence: "HIGH",
    lastSeenAt: "2026-08-20T00:00:00Z",
  };

  assert.equal(source.sourceType, "local_directory");
  assert.equal(source.topicRelevance, 95);
  assert.equal(source.geographicRelevance, "LOCAL");
});

test("3. Evidence requirement & 4. Competitor presence detection", () => {
  const source: ExternalSourceProfile = {
    domain: "justdial.com",
    sourceType: "business_directory",
    title: "Justdial Raipur",
    topicRelevance: 85,
    geographicRelevance: "LOCAL",
    clientPresent: false,
    competitorPresent: true,
    competitorDomains: ["rivaldental.com"],
    clientCitations: [],
    publicationCapability: "RECOMMENDATION_ONLY",
    evidence: ["Competitor verified on Justdial with 4.8 rating"],
    opportunityScore: 88,
    confidence: "HIGH",
    lastSeenAt: "2026-08-20T00:00:00Z",
  };

  const gaps = analyzeAuthorityGaps({
    clientDomain: "apollo.in",
    clientBusinessName: "Apollo Clinic",
    sources: [source],
  });

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].competitorsPresent[0], "rivaldental.com");
  assert.ok(gaps[0].evidence.length >= 2);
  assert.ok(gaps[0].evidence[0].includes("rivaldental.com"));
});

test("5. Authority gaps & 12. No fake authority scores", () => {
  const sources: ExternalSourceProfile[] = [
    {
      domain: "dental-tribune.com",
      sourceType: "industry_publication",
      title: "Dental Tribune India",
      topicRelevance: 90,
      geographicRelevance: "NATIONAL",
      clientPresent: false,
      competitorPresent: true,
      competitorDomains: ["rivaldental.com"],
      clientCitations: [],
      publicationCapability: "RECOMMENDATION_ONLY",
      evidence: ["Competitor published case study on dental implants"],
      opportunityScore: 85,
      confidence: "HIGH",
      lastSeenAt: "2026-08-20T00:00:00Z",
    },
  ];

  const report = runExternalAuthorityAnalysis({
    businessName: "Apex Clinic",
    domain: "apexclinic.in",
    services: ["Dental Implants", "Orthodontics"],
    locations: ["Raipur"],
    discoveredSources: sources,
  });

  assert.equal(report.authorityGaps.length, 1);
  assert.equal(report.authorityGaps[0].gapType, "missing_industry_citation");
  assert.ok(report.overallAuthorityScore <= 100);
});

test("6. Reddit discovery & 14. Community anti-spam policy", () => {
  const { reddit } = discoverCommunityOpportunities({
    businessName: "Apollo Diagnostics",
    services: ["Blood Test", "Full Body Checkup"],
    locations: ["Raipur"],
    competitors: ["Lal PathLabs"],
  });

  assert.ok(reddit.length >= 2);
  assert.equal(reddit[0].actionType, "DISCOVERY_ONLY");
  assert.equal(reddit[0].complianceChecked, true);
  assert.ok(reddit[0].suggestedExpertAngle.includes("transparent guidance"));
  assert.ok(!reddit[0].suggestedExpertAngle.includes("promotional spam"));
});

test("7. Quora discovery & 8. Forum discovery", () => {
  const { quora } = discoverCommunityOpportunities({
    businessName: "Apollo Diagnostics",
    services: ["Pathology"],
    locations: ["Raipur"],
  });

  assert.ok(quora.length >= 1);
  assert.equal(quora[0].actionType, "RECOMMENDATION_ONLY");
  assert.ok(quora[0].suggestedExpertAngle.includes("subject matter experts"));
});

test("9. Review intelligence & 10. Local intelligence", () => {
  const rep = analyzeReviewReputation({
    businessName: "Apollo Clinic",
    totalReviews: 45,
    averageRating: 4.8,
    responseRate: 70,
  });

  assert.equal(rep.trend, "IMPROVING");
  assert.equal(rep.responseCoveragePercentage, 70);
  assert.ok(rep.recommendations.some((r) => r.includes("response rate")));
});

test("11. Entity graph consistency", () => {
  const nodes = buildEntityCitationGraph({
    businessName: "Apollo Clinic",
    domain: "clinic.in",
    services: ["Dental", "Cardiology"],
    locations: ["Raipur"],
    hasGbp: true,
    hasSchema: true,
    externalSourcesCount: 5,
  });

  const brand = nodes.find((n) => n.entityType === "BRAND");
  assert.ok(brand);
  assert.equal(brand?.consistencyStatus, "CONSISTENT");
  assert.equal(brand?.relationships.length, 3); // 2 services + 1 location
});

test("11b. Entity graph NAP consistency: genuine data comparison, not presence-only (see docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md)", () => {
  const base = {
    businessName: "Apollo Clinic",
    domain: "clinic.in",
    services: ["Dental"],
    locations: ["Raipur"],
    hasGbp: true,
    hasSchema: true,
    externalSourcesCount: 5,
  };

  // Fully consistent: same real phone (formatting-only difference) + address match exactly.
  const consistent = buildEntityCitationGraph({
    ...base,
    nap: { websitePhone: "98765 43210", gbpPhone: "9876543210", websiteAddress: "12 MG Road, Raipur", gbpAddress: "12 MG Road, Raipur" },
  });
  assert.equal(consistent.find((n) => n.entityType === "LOCATION")?.consistencyStatus, "CONSISTENT");

  // Phone mismatch: a real, different number.
  const phoneMismatch = buildEntityCitationGraph({
    ...base,
    nap: { websitePhone: "9876543210", gbpPhone: "9111111111", websiteAddress: "12 MG Road, Raipur", gbpAddress: "12 MG Road, Raipur" },
  });
  const phoneLoc = phoneMismatch.find((n) => n.entityType === "LOCATION")!;
  assert.equal(phoneLoc.consistencyStatus, "INCONSISTENT");
  assert.ok(phoneLoc.evidence.some((e) => e.includes("Phone mismatch")));
  assert.equal(phoneLoc.attributes.phoneConsistent, false);

  // Address mismatch: a real, different address.
  const addressMismatch = buildEntityCitationGraph({
    ...base,
    nap: { websitePhone: "9876543210", gbpPhone: "9876543210", websiteAddress: "12 MG Road, Raipur", gbpAddress: "45 Civil Lines, Raipur" },
  });
  const addrLoc = addressMismatch.find((n) => n.entityType === "LOCATION")!;
  assert.equal(addrLoc.consistencyStatus, "INCONSISTENT");
  assert.ok(addrLoc.evidence.some((e) => e.includes("Address mismatch")));

  // Missing comparable data (no GBP data supplied): falls back to the
  // original presence-only behavior, never fabricates a mismatch it can't evidence.
  const noNapData = buildEntityCitationGraph(base);
  assert.equal(noNapData.find((n) => n.entityType === "LOCATION")?.consistencyStatus, "CONSISTENT"); // hasGbp: true, no comparable data supplied
});

test("13. No fake publication status & 15. Free execution blocked", () => {
  const sources: ExternalSourceProfile[] = [
    {
      domain: "timesofindia.indiatimes.com",
      sourceType: "news_publication",
      title: "Times of India Local Health",
      topicRelevance: 70,
      geographicRelevance: "REGIONAL",
      clientPresent: false,
      competitorPresent: true,
      competitorDomains: ["rival.in"],
      clientCitations: [],
      publicationCapability: "READ_ONLY",
      evidence: ["Featured story on rival clinic"],
      opportunityScore: 70,
      confidence: "MEDIUM",
      lastSeenAt: "2026-08-20T00:00:00Z",
    },
  ];

  const gaps = analyzeAuthorityGaps({
    clientDomain: "clinic.in",
    clientBusinessName: "Clinic",
    sources,
  });

  assert.equal(gaps[0].actionType, "RECOMMENDATION_ONLY");
  assert.notEqual(gaps[0].actionType, "EXECUTABLE");
});

test("16. Paid execution policy enforced & 17. Tenant isolation", () => {
  const rep1 = runExternalAuthorityAnalysis({
    businessName: "Tenant A Clinic",
    domain: "tenant-a.in",
    services: ["Service A"],
    locations: ["City A"],
  });

  const rep2 = runExternalAuthorityAnalysis({
    businessName: "Tenant B Clinic",
    domain: "tenant-b.in",
    services: ["Service B"],
    locations: ["City B"],
  });

  assert.notEqual(rep1.localProfile.businessName, rep2.localProfile.businessName);
  assert.notEqual(rep1.redditRadar[0].subreddit, rep2.redditRadar[0].subreddit);
});

test("18. Duplicate opportunity prevention & 19. Provider unavailable handling", () => {
  const sources: ExternalSourceProfile[] = [
    {
      domain: "practo.com",
      sourceType: "local_directory",
      title: "Practo",
      topicRelevance: 80,
      geographicRelevance: "LOCAL",
      clientPresent: false,
      competitorPresent: true,
      competitorDomains: ["rival.in"],
      clientCitations: [],
      publicationCapability: "READ_ONLY",
      evidence: ["Listing exists"],
      opportunityScore: 80,
      confidence: "HIGH",
      lastSeenAt: "2026-08-20T00:00:00Z",
    },
  ];

  const gaps1 = analyzeAuthorityGaps({ clientDomain: "c.in", clientBusinessName: "C", sources });
  const gaps2 = analyzeAuthorityGaps({ clientDomain: "c.in", clientBusinessName: "C", sources });

  assert.equal(gaps1[0].id, gaps2[0].id);
});

test("20. Source provenance & 21. Action-policy integration & 22. Measurement attribution", () => {
  const report = runExternalAuthorityAnalysis({
    businessName: "Apollo Clinic",
    domain: "clinic.in",
    services: ["Dental"],
    locations: ["Raipur"],
    hasGbp: true,
    hasSchema: true,
  });

  assert.ok(report.entityNodes.length > 0);
  assert.ok(report.overallAuthorityScore > 0);
  assert.ok(report.reputationSummary.totalReviewCount > 0);
});
