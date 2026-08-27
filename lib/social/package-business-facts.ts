/**
 * Fact/Claim Safety Layer for Package Autopilot's caption generation (build
 * brief Section 5): the ONLY place allowed to turn a tenant's verified
 * business data into the `businessInformation` strings handed to the AI
 * provider. Every fact here is labeled with its real source (Google
 * Business Profile vs. owner-provided audit intake) so the model is never
 * left guessing whether something is a hard fact. A field that isn't
 * actually present is simply omitted -- never defaulted, never guessed.
 *
 * Deliberately excludes phone numbers, ratings, review counts, and offers/
 * discounts even where present upstream: this module is used for generic
 * package posts (not an offer-specific pillar), and the safest default
 * is fewer, certain facts over more, riskier ones. Address/category/
 * website/location/audience are stable, low-risk facts to reference in a
 * caption; a phone number or a specific rating is exactly the kind of
 * claim the brief calls out as a hard-fail if ever wrong or stale.
 *
 * No Supabase/queue/payments imports, so (unlike package-autopilot.ts)
 * this module's graph resolves standalone under
 * `node --experimental-strip-types` -- see package-business-facts.test.ts.
 */

export interface VerifiedGoogleBusinessFacts {
  address?: string | null;
  category?: string | null;
  websiteUri?: string | null;
}

export interface VerifiedBrandBrainFacts {
  location?: unknown;
  target_audience?: unknown;
  priority_offering?: unknown;
  differentiation?: unknown;
  average_customer_spend?: unknown;
  business_stage?: unknown;
  growth_priority?: unknown;
}

function pushIfText(facts: string[], label: string, value: unknown) {
  if (typeof value === "string" && value.trim()) facts.push(`${label}: ${value.trim()}`);
}

export function buildVerifiedBusinessInformation(input: {
  googleBusiness?: VerifiedGoogleBusinessFacts | null;
  brandBrain?: VerifiedBrandBrainFacts | null;
}): string[] {
  const facts: string[] = [];

  const gbp = input.googleBusiness;
  if (gbp) {
    pushIfText(facts, "Verified business address (Google Business Profile)", gbp.address);
    pushIfText(facts, "Verified Google Business category", gbp.category);
    pushIfText(facts, "Verified website", gbp.websiteUri);
  }

  const brain = input.brandBrain;
  if (brain) {
    pushIfText(facts, "Business location (as provided by the owner)", brain.location);
    pushIfText(facts, "Target audience", brain.target_audience);
    pushIfText(facts, "Priority offering to highlight", brain.priority_offering);
    pushIfText(facts, "What makes this business different", brain.differentiation);
    pushIfText(facts, "Typical customer spend", brain.average_customer_spend);
    pushIfText(facts, "Business stage", brain.business_stage);
    pushIfText(facts, "Current growth priority", brain.growth_priority);
  }

  return facts;
}
