/**
 * Vercel Website Connector Types.
 *
 * Built to close the gap documented in
 * docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md. Real, current Vercel
 * REST API endpoints below were verified against Vercel's own live
 * documentation during this task (fetched, not recalled from training
 * data) -- see client.ts's per-function doc comments for the exact pages.
 *
 * Engineering decision, made autonomously per the requested priority
 * order (existing mature implementation > configured provider capability
 * > lowest friction > lowest operational complexity > lowest cost >
 * strongest security > best architecture):
 *
 * Vercel's real third-party integration model is the Marketplace / Native
 * Integration framework (confirmed via
 * vercel.com/docs/integrations/create-integration/marketplace-api) --
 * this requires implementing a server-side "Partner API" Vercel calls
 * INTO, a formal integration submission + Vercel's own review/approval
 * before the OAuth app can be used at all, OIDC token verification, and a
 * billing/webhook surface. That is real, but it is not "connect a
 * website" -- it is "become a Vercel Marketplace vendor", a business
 * process this session cannot complete (Vercel's approval), and
 * disproportionate engineering surface for what this feature needs.
 *
 * Chosen instead: a scoped Vercel Personal Access Token (a real, already
 * -existing, user-generated Vercel feature -- Account Settings > Tokens,
 * scopable to a specific team and a specific set of projects with a
 * chosen permission level in Vercel's own UI). This is lower friction (no
 * Vercel review wait), lower operational complexity (no Partner API to
 * host), and still least-privilege (the customer scopes the token
 * themselves at creation). It is the same authentication model this
 * codebase already documents in code comments as "the Vercel CLI's own
 * `vercel env pull`/deploy auth" (see MANUAL_SETUP_REQUIRED.md's Hobby
 * cron-limit commit for existing real Vercel API usage precedent in this
 * exact codebase). Token, not raw, is stored -- see connector.ts for the
 * real vault-backed storage.
 */

export interface VercelProjectDomain {
  name: string;
  verified: boolean;
  apexName: string;
}

export interface VercelProjectSummary {
  externalProjectId: string;
  projectName: string;
  framework: string | null;
  domains: VercelProjectDomain[];
  lastDeploymentState: string | null;
  lastDeploymentUrl: string | null;
}

export interface VercelTokenValidationResult {
  valid: boolean;
  accountId: string | null;
  accountName: string | null;
  /** Set only when this token is scoped to a specific Team rather than
   * "Full Account" -- see client.ts's validateVercelToken for why this
   * matters (a team-scoped token has no personal /v2/user resource and
   * must pass ?teamId= on every subsequent project/domain call). */
  teamId: string | null;
  reason: string | null;
}

export type WebsiteConnectionScope = "ANALYSIS_ONLY" | "AUTONOMOUS_WRITE";
