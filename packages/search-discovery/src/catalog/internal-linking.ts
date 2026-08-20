import type { InternalLinkPlan } from "./types.ts";

export interface PageLinkContext {
  url: string;
  title: string;
  topic: string;
  inboundLinksCount: number;
  outboundLinks: string[];
}

/**
 * Discovers orphan pages and constructs topical internal linking plans.
 */
export function planInternalLinkOptimization(input: {
  pages: PageLinkContext[];
}): InternalLinkPlan[] {
  const plans: InternalLinkPlan[] = [];

  const orphans = input.pages.filter((p) => p.inboundLinksCount === 0);

  for (const orphan of orphans) {
    // Find relevant parent or sibling page sharing the topic
    const candidateParent = input.pages.find(
      (p) => p.url !== orphan.url && (p.topic === orphan.topic || p.url.endsWith("/services") || p.url === "https://example.com")
    );

    if (candidateParent && !candidateParent.outboundLinks.includes(orphan.url)) {
      plans.push({
        sourcePageUrl: candidateParent.url,
        targetPageUrl: orphan.url,
        anchorText: orphan.title || "Specialized Services",
        contextSentence: `Explore our full scope of ${orphan.title.toLowerCase()} for detailed treatment information.`,
        rationale: `Orphan page repair: Connects ${orphan.url} from parent topic hub (${candidateParent.url}).`,
      });
    }
  }

  return plans;
}
