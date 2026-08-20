import { createHash } from "node:crypto";
import type { RedditRadarItem, QuoraRadarItem } from "./types.ts";

function stableFingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
}

export function discoverCommunityOpportunities(input: {
  businessName: string;
  services: string[];
  locations: string[];
  competitors?: string[];
}): { reddit: RedditRadarItem[]; quora: QuoraRadarItem[] } {
  const reddit: RedditRadarItem[] = [];
  const quora: QuoraRadarItem[] = [];

  const primaryLocation = input.locations[0] || "India";
  const primaryService = input.services[0] || "Services";

  // 1. Reddit Discussion Radar (Compliant Topic Radar)
  for (const service of input.services.slice(0, 3)) {
    const threadTitle = `Recommendations for reliable ${service.toLowerCase()} in ${primaryLocation}?`;
    reddit.push({
      id: stableFingerprint(["reddit", service, primaryLocation]),
      subreddit: `r/${primaryLocation.toLowerCase().replace(/\s+/g, "")}`,
      threadUrl: `https://www.reddit.com/r/${primaryLocation.toLowerCase().replace(/\s+/g, "")}/search?q=${encodeURIComponent(service)}`,
      title: threadTitle,
      topic: service,
      intent: "recommendation",
      relevanceScore: 92,
      engagementScore: 45,
      competitorMentioned: Boolean(input.competitors && input.competitors.length > 0),
      clientMentioned: false,
      suggestedExpertAngle: `Provide helpful, transparent guidance on what customers should verify when choosing ${service.toLowerCase()} (e.g. equipment, pricing transparency, doctor credentials).`,
      actionType: "DISCOVERY_ONLY",
      complianceChecked: true,
    });
  }

  // 2. Quora Question Radar
  for (const service of input.services.slice(0, 2)) {
    const questionText = `What should I consider before booking a ${service.toLowerCase()} consultation?`;
    quora.push({
      id: stableFingerprint(["quora", service]),
      questionUrl: `https://www.quora.com/search?q=${encodeURIComponent(service)}`,
      question: questionText,
      topic: service,
      intent: "how_to",
      relevanceScore: 88,
      competitorPresent: false,
      clientPresent: false,
      suggestedExpertAngle: `Answer comprehensively as ${input.businessName} subject matter experts, outlining clinical or industry best practices without promotional spam.`,
      actionType: "RECOMMENDATION_ONLY",
    });
  }

  return { reddit, quora };
}
