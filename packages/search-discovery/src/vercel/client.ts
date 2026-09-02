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

async function vercelFetch(token: string, path: string, fetcher: typeof fetch = fetch, method: "GET" | "POST" = "GET"): Promise<Response> {
  const response = await fetcher(`${VERCEL_API_BASE}${path}`, {
    method,
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
 * Fixed (Update 19): on a 404 specifically fall back to GET /v2/teams --
 * a team-scoped token can always list the team(s) it belongs to. Success
 * there is treated as a valid, team-scoped token; its teamId is returned
 * so every subsequent project/domain call can pass ?teamId= correctly.
 *
 * Update 24, first pass: a real customer still saw the generic "Vercel
 * could not be reached" message after the above fix -- differentiated
 * `reason` into INVALID_TOKEN / TEAM_REQUIRED / PROVIDER_UNAVAILABLE /
 * INTERNAL_ERROR.
 *
 * Update 24, second pass (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md):
 * a customer then tried a genuinely FRESH token and got INVALID_TOKEN
 * again. Re-verified Vercel's own current, live docs end to end (fetched
 * during this fix) rather than assuming a customer/copy-paste error, and
 * found the real cause: Vercel now documents a THIRD token scope this
 * client never accounted for. From vercel.com/docs/rest-api/getting-started
 * (fetched live): "Understand account, team, and project scope ... Project:
 * The token's single project ... A project-scoped token denies requests
 * for user-level resources, team-level resources, and other projects."
 * The same page's own guidance is to "Choose the narrowest scope that
 * covers the projects you need" -- meaning a security-conscious customer
 * choosing the narrowest, most-recommended scope for exactly this
 * connector's use case (one website) would have their genuinely valid
 * token rejected by /v2/user AND /v2/teams, both "denied" by design, and
 * this client had no third fallback to try. Worse: the prior code only
 * ever fell back past a 404 on /v2/user, never a 401/403 -- but Vercel
 * documents 401 and 403 (not 404) as /v2/user's real "denied" responses,
 * so a project-scoped token most likely never even reached the old
 * /v2/teams fallback at all.
 *
 * Fixed: /v2/user's fallback chain now triggers on ANY non-2xx status
 * (not just 404), tries /v2/teams, and -- new this pass -- falls back
 * further to GET /v10/projects (no teamId, letting Vercel infer it from
 * the token, exactly as the docs specify for a project-scoped token) before
 * concluding the token is genuinely invalid. Only when /v2/user, /v2/teams,
 * AND /v10/projects have ALL been tried and none resolved a usable
 * identity does this return INVALID_TOKEN -- and only when at least one of
 * them explicitly returned 401/403 (an unambiguous "denied", not just an
 * empty list) is that classification used, per section 21 of the brief
 * this fixed: "do not stop at INVALID_TOKEN unless the actual Vercel
 * response proves it."
 */
/** Every failing branch below shares the same null identity shape --
 * built once so the /v2/user status + Vercel's own safe error envelope
 * fields (captured once, up front, since that's the primary evidence
 * point for a real forensic record) are never forgotten on any path. */
function invalidResult(
  reason: string,
  diagnostics: { httpStatus: number | null; providerErrorCode: string | null; providerErrorMessage: string | null },
): VercelTokenValidationResult {
  return { valid: false, accountId: null, accountName: null, teamId: null, projectId: null, reason, ...diagnostics };
}

export async function validateVercelToken(token: string, fetcher: typeof fetch = fetch): Promise<VercelTokenValidationResult> {
  let diagnostics: { httpStatus: number | null; providerErrorCode: string | null; providerErrorMessage: string | null } = {
    httpStatus: null,
    providerErrorCode: null,
    providerErrorMessage: null,
  };
  try {
    const userResponse = await vercelFetch(token, "/v2/user", fetcher);
    diagnostics = { httpStatus: userResponse.status, providerErrorCode: null, providerErrorMessage: null };
    if (userResponse.ok) {
      const body = (await userResponse.json()) as { user?: { id?: string; username?: string; name?: string | null } };
      if (!body.user?.id) return invalidResult("INTERNAL_ERROR", diagnostics);
      return { valid: true, accountId: body.user.id, accountName: body.user.name || body.user.username || null, teamId: null, projectId: null, reason: null, ...diagnostics };
    }
    // Update 24, forensic pass (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
    // section 1): capture Vercel's own real, safe error envelope
    // ({ error: { code, message } }, vercel.com/docs/rest-api/errors,
    // fetched live) for /v2/user specifically -- the primary evidence
    // point for a real diagnostic record. Best-effort: a non-JSON or
    // differently-shaped body must never crash validation.
    try {
      const errorBody = (await userResponse.json()) as { error?: { code?: string; message?: string } };
      diagnostics.providerErrorCode = errorBody.error?.code ?? null;
      diagnostics.providerErrorMessage = errorBody.error?.message ?? null;
    } catch {
      // best-effort only
    }
    if (userResponse.status >= 500) {
      // A genuine Vercel-side outage on /v2/user -- no point trying
      // narrower-scope fallbacks, they would hit the same outage.
      return invalidResult("PROVIDER_UNAVAILABLE", diagnostics);
    }

    // /v2/user denied this token (401/403/404/anything else non-2xx, not
    // 5xx) -- ambiguous by itself: could be a genuinely bad token, or a
    // Team- or Project-scoped token, both of which Vercel documents as
    // legitimately denying user-level resource access. Try progressively
    // narrower real scopes before concluding anything.
    let sawExplicitDenial = userResponse.status === 401 || userResponse.status === 403;

    const teamsResult = await listVercelTeams(token, fetcher);
    if (teamsResult.teams.length > 0) {
      const team = teamsResult.teams[0]!;
      return { valid: true, accountId: team.id, accountName: team.name || team.slug || null, teamId: team.id, projectId: null, reason: null, ...diagnostics };
    }
    if (teamsResult.failureReason === "UNAVAILABLE") return invalidResult("PROVIDER_UNAVAILABLE", diagnostics);
    if (teamsResult.failureReason === "UNAUTHORIZED") sawExplicitDenial = true;

    // Update 24, second pass: the new fallback -- a Project-scoped token
    // has no personal /v2/user resource AND no team to list, but can
    // always list its own single project via /v10/projects with no
    // teamId (Vercel infers it from the token).
    try {
      const projects = await listVercelProjects(token, { fetcher });
      if (projects.length > 0) {
        const project = projects[0]!;
        return { valid: true, accountId: null, accountName: project.projectName, teamId: null, projectId: project.externalProjectId, reason: null, ...diagnostics };
      }
    } catch (err) {
      if (err instanceof VercelApiError) {
        if (err.status >= 500) return invalidResult("PROVIDER_UNAVAILABLE", diagnostics);
        if (err.status === 401 || err.status === 403) sawExplicitDenial = true;
      }
    }

    if (sawExplicitDenial) return invalidResult("INVALID_TOKEN", diagnostics);
    // Every endpoint responded without an explicit 401/403 anywhere, but
    // none resolved a usable identity (e.g. a 404 with genuinely zero
    // teams and zero projects) -- authenticated, but nothing to act on.
    return invalidResult("TEAM_REQUIRED", diagnostics);
  } catch (err) {
    return invalidResult("PROVIDER_UNAVAILABLE", {
      httpStatus: diagnostics.httpStatus,
      providerErrorCode: null,
      providerErrorMessage: err instanceof Error ? err.message.slice(0, 200) : null,
    });
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

/**
 * Verified: POST /v10/projects/{projectId}/promote/{deploymentId}, bearer
 * auth (vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment,
 * fetched live 2026-09-02, not recalled from training data). "This does NOT
 * rebuild the deployment" -- points production traffic at an existing,
 * already-built deployment. Real success is 201/202 with no response body
 * (per the same doc) -- this function does not attempt to parse one.
 * Callers must independently confirm deploymentId belongs to a real,
 * READY deployment for this exact project before calling this (see
 * rollback-deployment-tool.ts) -- this function trusts its caller, the same
 * way listVercelDeployments trusts a caller not to invent a projectId.
 */
export async function promoteVercelDeployment(token: string, opts: { projectId: string; deploymentId: string; teamId?: string; fetcher?: typeof fetch }): Promise<void> {
  const query = opts.teamId ? `?teamId=${encodeURIComponent(opts.teamId)}` : "";
  const response = await vercelFetch(token, `/v10/projects/${encodeURIComponent(opts.projectId)}/promote/${encodeURIComponent(opts.deploymentId)}${query}`, opts.fetcher, "POST");
  if (!response.ok) {
    throw new VercelApiError(`Failed to promote Vercel deployment ${opts.deploymentId} for project ${opts.projectId}: HTTP ${response.status}`, response.status);
  }
}
