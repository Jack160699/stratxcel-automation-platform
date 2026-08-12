
import type { SourceQualityClass } from "./types.ts";

const GOV_TLDS = [".gov", ".gov.in", ".nic.in", ".mil"];
const EDU_TLDS = [".edu", ".ac.in", ".edu.in"];

/**
 * Conservative source quality classification.
 * Unknown stays UNKNOWN — never invent authority rankings.
 */
export function classifySourceQuality(args: {
  domain: string;
  preferredDomains?: readonly string[];
  requiredDomains?: readonly string[];
  entityDomains?: readonly string[];
}): SourceQualityClass {
  const domain = args.domain.toLowerCase().replace(/^www\./, "");

  if (args.entityDomains?.some((d) => domainEqualsOrSub(domain, d))) {
    return "PRIMARY";
  }
  if (GOV_TLDS.some((t) => domain.endsWith(t) || domain.includes(t + "."))) {
    return "OFFICIAL";
  }
  if (domain.endsWith(".gov") || domain.endsWith(".gov.in")) {
    return "OFFICIAL";
  }
  if (EDU_TLDS.some((t) => domain.endsWith(t))) {
    return "REPUTABLE_SECONDARY";
  }
  // User preference/filter lists do not define authority.
  void args.preferredDomains;
  void args.requiredDomains;

  // Common UGC hosts — conservative.
  if (
    /^(www\.)?(reddit\.com|quora\.com|medium\.com|substack\.com|blogspot\.com|wordpress\.com|tumblr\.com)$/i.test(
      domain,
    )
  ) {
    return "USER_GENERATED";
  }

  return "UNKNOWN";
}

function domainEqualsOrSub(domain: string, raw: string): boolean {
  const d = raw.toLowerCase().replace(/^www\./, "").trim();
  if (!d) return false;
  return domain === d || domain.endsWith(`.${d}`);
}

export function preferPrimarySources<T extends { sourceType: SourceQualityClass }>(
  sources: readonly T[],
): T[] {
  const rank: Record<SourceQualityClass, number> = {
    PRIMARY: 0,
    OFFICIAL: 1,
    REPUTABLE_SECONDARY: 2,
    SECONDARY: 3,
    USER_GENERATED: 4,
    UNKNOWN: 5,
  };
  return [...sources].sort((a, b) => rank[a.sourceType] - rank[b.sourceType]);
}
