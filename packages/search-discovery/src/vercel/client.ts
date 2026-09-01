import type { VercelProjectDomain, VercelProjectSummary, VercelTokenValidationResult } from "./types.ts";

/**
 * Vercel REST API client. Every endpoint below was verified against
 * Vercel's live documentation during this task (fetched, not recalled
 * from training data) -- see the per-function comment for the exact
 * verified path. Base: https://api.vercel.com (confirmed across every
 * fetched example).
 */

const VERCEL_API_BASE = "https://api.vercel.com";

export class VercelApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "VercelApiError";
    this.status = status;
  }
}

async function vercelFetch(token: string, path: string, fetcher: typeof fetch = fetch): Promise<Response> {
  const response = await fetcher(`${VERCEL_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  return response;
}

interface VercelTeamsLookup {
  teams: Array<{ id: string; name: string | null; slug: string | null }>;
  /**
   * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
   * Update 23: a real customer still saw the generic "Vercel could not be
   * reached" message after Update 19's team-token fix. Traced to this
   * function silently `return []`-ing on ANY non-ok /v2/teams response,
   * indistinguishably collapsing three different real causes -- a
   * genuinely bad token (401/403), a genuinely valid-but-team-less token
   * (200 with zero teams), and Vercel's own API being unavailable
   * (5xx/network). validateVercelToken's caller can't report the right
   * customer-facing reason without this distinction, so it's captured
   * here instead of discarded. null means the call itself succeeded
   * (whether or not it returned any teams).
   */
  failureReason: "UNAUTHORIZED" | "UNAVAILABLE" | null;
}

/**
 * Verified: GET /v2/teams, bearer auth, `limit` query param
 * (vercel.com/docs/rest-api/teams/list-all-teams). Used as the fallback
 * identity check in validateVercelToken() for a Team-scoped token -- see
 * that function's comment.
 */
async function listVercelTeams(token: string, fetcher: typeof fetch): Promise<VercelTeamsLookup> {
  let response: Response;
  try {
    response = await vercelFetch(token, "/v2/teams?limit=20", fetcher);
  } catch {
    return { teams: [], failureReason: "UNAVAILABLE" };
  }
  if (response.status === 401 || response.status === 403) return { teams: [], failureReason: "UNAUTHORIZED" };
  if (!response.ok) return { teams: [], failureReason: "UNAVAILABLE" };
  const body = (await response.json()) as { teams?: Array<{ id: string; name?: string | null; slug?: string | null }> };
  return { teams: (body.teams ?? []).map((t) => ({ id: t.id, name: t.name ?? null, slug: t.slug ?? null })), failureReason: null };
}

/**
 * Validates a token and identifies the connected account. Root-caused via
 * docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update 19: a real,
 * live customer-reported VERCEL_API_ERROR_404 on Connect Vercel. Traced
 * against Vercel's own live, current REST API documentation (fetched
 * during this fix, confirmed byte-for-byte correct: GET /v2/user,
 * GET /v10/projects, GET /v9/projects/{id}/domains are all exactly the
 * documented paths -- this was never a wrong-endpoint bug).
 *
 * Root cause: GET /v2/user (vercel.com/docs/rest-api/user/get-the-user)
 * only documents 200/302/400/401/403/409/410 as possible responses -- 404
 * is not among them for a genuinely invalid/expired token (those return
 * 401/403, confirmed in the same docs). A Vercel Personal Access Token
 * created scoped to a specific Team (rather than "Full Account" -- a
 * completely normal, common choice for any account that operates under a
 * team, which Vercel itself offers at token-creation time) has no
 * personal-account "user" resource to return at all, and 404s here even
 * though the token is genuinely valid. listVercelProjects already
 * anticipated this (it already accepts an optional teamId param) --
 * validateVercelToken, the very first call in the whole connect flow,
 * never did, so every team-scoped token failed before reaching any code
 * that could have used that support.
 *
 * Fixed: on a 404 specifically (never on 401/403, which stay a genuine,
 * immediate INVALID_TOKEN) fall back to GET /v2/teams -- a team-
 * scoped token can always list the team(s) it belongs to. Success there
 * is treated as a valid, team-scoped token; its teamId is returned so
 * every subsequent project/domain call can pass ?teamId= correctly.
 *
 * Update 23 (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md): a real
 * customer still saw the generic "Vercel could not be reached" message
 * after the above fix -- meaning their token 404'd on /v2/user AND the
 * /v2/teams fallback also didn't resolve a usable team, but every one of
 * those distinct outcomes reported the exact same stale
 * VERCEL_API_ERROR_404 reason regardless of what /v2/teams actually said.
 * `reason` is now one of a small, differentiated, customer-actionable set
 * instead of a raw HTTP-status passthrough:
 *   - INVALID_TOKEN: /v2/user (or the /v2/teams fallback) returned 401/403
 *     -- the token itself is wrong, revoked, or expired.
 *   - TEAM_REQUIRED: /v2/user 404'd (team-scoped token shape) AND
 *     /v2/teams genuinely succeeded but returned zero teams -- Vercel
 *     accepted the token but it has no team/account access to use.
 *   - PROVIDER_UNAVAILABLE: Vercel itself returned a 5xx/unexpected status
 *     or the request failed at the network level (either endpoint) --
 *     not a customer credential problem.
 *   - INTERNAL_ERROR: Vercel returned 200 but a response shape this
 *     client doesn't recognize -- a contract mismatch on our side, not a
 *     customer-actionable state.
 * Deliberately NOT including TEAM_NOT_FOUND / PROJECT_NOT_FOUND /
 * DOMAIN_MISMATCH here: those describe a specific team/project/domain
 * failing to match something, which only becomes knowable later, in
 * discoverVercelProjects/matchVercelProjectToWebsite -- neither Vercel
 * API called here can actually distinguish those cases, and inventing a
 * fake distinction they don't support would be worse than not having it.
 */
export async function validateVercelToken(token: string, fetcher: typeof fetch = fetch): Promise<VercelTokenValidationResult> {
  try {
    const response = await vercelFetch(token, "/v2/user", fetcher);
    if (response.status === 401 || response.status === 403) {
      return { valid: false, accountId: null, accountName: null, teamId: null, reason: "INVALID_TOKEN" };
    }
    if (response.status === 404) {
      const { teams, failureReason } = await listVercelTeams(token, fetcher);
      if (teams.length > 0) {
        const team = teams[0]!;
        return { valid: true, accountId: team.id, accountName: team.name || team.slug || null, teamId: team.id, reason: null };
      }
      if (failureReason === "UNAUTHORIZED") {
        return { valid: false, accountId: null, accountName: null, teamId: null, reason: "INVALID_TOKEN" };
      }
      if (failureReason === "UNAVAILABLE") {
        return { valid: false, accountId: null, accountName: null, teamId: null, reason: "PROVIDER_UNAVAILABLE" };
      }
      // failureReason is null here -- /v2/teams genuinely succeeded, just
      // with zero teams. The token authenticates but has nothing for it
      // to act on.
      return { valid: false, accountId: null, accountName: null, teamId: null, reason: "TEAM_REQUIRED" };
    }
    if (!response.ok) {
      return { valid: false, accountId: null, accountName: null, teamId: null, reason: "PROVIDER_UNAVAILABLE" };
    }
    const body = (await response.json()) as { user?: { id?: string; username?: string; name?: string | null } };
    if (!body.user?.id) {
      return { valid: false, accountId: null, accountName: null, teamId: null, reason: "INTERNAL_ERROR" };
    }
    return { valid: true, accountId: body.user.id, accountName: body.user.name || body.user.username || null, teamId: null, reason: null };
  } catch {
    return { valid: false, accountId: null, accountName: null, teamId: null, reason: "PROVIDER_UNAVAILABLE" };
  }
}

interface RawVercelProject {
  id: string;
  name: string;
  framework: string | null;
  alias?: Array<{ domain: string }>;
  latestDeployments?: Array<{ id: string; url: string; readyState: string; target?: string | null }>;
}

/**
 * Verified: GET /v10/projects, bearer auth, optional teamId query param,
 * response is either a raw array or `{ projects: [...], pagination }`
 * (vercel.com/docs/rest-api/projects/retrieve-a-list-of-projects) --
 * handled defensively for both shapes since the exact shape depends on
 * account/team context this client doesn't control.
 */
export async function listVercelProjects(token: string, opts: { teamId?: string; fetcher?: typeof fetch } = {}): Promise<VercelProjectSummary[]> {
  const query = opts.teamId ? `?teamId=${encodeURIComponent(opts.teamId)}` : "";
  const response = await vercelFetch(token, `/v10/projects${query}`, opts.fetcher);
  if (!response.ok) {
    throw new VercelApiError(`Failed to list Vercel projects: HTTP ${response.status}`, response.status);
  }
  const body = (await response.json()) as RawVercelProject[] | { projects: RawVercelProject[] };
  const rawProjects = Array.isArray(body) ? body : body.projects ?? [];

  return rawProjects.map((p) => {
    const latest = p.latestDeployments?.[0];
    const domains: VercelProjectDomain[] = (p.alias ?? []).map((a) => ({
      name: a.domain,
      verified: true, // The alias list only ever contains assigned aliases; verification-pending domains are surfaced via listVercelProjectDomains, not this summary.
      apexName: a.domain,
    }));
    return {
      externalProjectId: p.id,
      projectName: p.name,
      framework: p.framework,
      domains,
      lastDeploymentState: latest?.readyState ?? null,
      lastDeploymentUrl: latest?.url ?? null,
    };
  });
}

interface RawVercelDomain {
  name: string;
  apexName: string;
  verified: boolean;
}

/**
 * Verified: GET /v9/projects/{idOrName}/domains, bearer auth
 * (vercel.com/docs/rest-api/projects -> "Retrieve project domains by
 * project by id or name"). Gives real verification status per domain,
 * which listVercelProjects's alias summary doesn't. Update 19: accepts
 * the same optional teamId as listVercelProjects/listVercelTeams, for the
 * same reason -- a project owned by a Team is only unambiguously
 * resolvable with that team's context on a team-scoped token.
 */
export async function listVercelProjectDomains(token: string, projectIdOrName: string, opts: { teamId?: string; fetcher?: typeof fetch } = {}): Promise<VercelProjectDomain[]> {
  const query = opts.teamId ? `?teamId=${encodeURIComponent(opts.teamId)}` : "";
  const response = await vercelFetch(token, `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains${query}`, opts.fetcher);
  if (!response.ok) {
    throw new VercelApiError(`Failed to list domains for Vercel project ${projectIdOrName}: HTTP ${response.status}`, response.status);
  }
  const body = (await response.json()) as { domains: RawVercelDomain[] };
  return (body.domains ?? []).map((d) => ({ name: d.name, apexName: d.apexName, verified: d.verified }));
}

/**
 * Verified: GET /v7/deployments, bearer auth, `projectId` + `limit` query
 * params (vercel.com/docs/rest-api/deployments -> "List deployments").
 */
export async function listVercelDeployments(token: string, opts: { projectId: string; limit?: number; fetcher?: typeof fetch }): Promise<Array<{ id: string; url: string; readyState: string; createdAt: number }>> {
  const params = new URLSearchParams({ projectId: opts.projectId, limit: String(opts.limit ?? 10) });
  const response = await vercelFetch(token, `/v7/deployments?${params.toString()}`, opts.fetcher);
  if (!response.ok) {
    throw new VercelApiError(`Failed to list deployments for Vercel project ${opts.projectId}: HTTP ${response.status}`, response.status);
  }
  const body = (await response.json()) as { deployments: Array<{ uid: string; url: string; readyState: string; createdAt: number }> };
  return (body.deployments ?? []).map((d) => ({ id: d.uid, url: d.url, readyState: d.readyState, createdAt: d.createdAt }));
}
