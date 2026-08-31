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

/**
 * Validates a token and identifies the connected account. Verified:
 * GET /v2/user, bearer auth, 401 on an invalid/expired token
 * (vercel.com/docs/rest-api/user/get-the-user).
 */
export async function validateVercelToken(token: string, fetcher: typeof fetch = fetch): Promise<VercelTokenValidationResult> {
  try {
    const response = await vercelFetch(token, "/v2/user", fetcher);
    if (response.status === 401 || response.status === 403) {
      return { valid: false, accountId: null, accountName: null, reason: "TOKEN_UNAUTHORIZED" };
    }
    if (!response.ok) {
      return { valid: false, accountId: null, accountName: null, reason: `VERCEL_API_ERROR_${response.status}` };
    }
    const body = (await response.json()) as { user?: { id?: string; username?: string; name?: string | null } };
    if (!body.user?.id) {
      return { valid: false, accountId: null, accountName: null, reason: "MALFORMED_RESPONSE" };
    }
    return { valid: true, accountId: body.user.id, accountName: body.user.name || body.user.username || null, reason: null };
  } catch (err) {
    return { valid: false, accountId: null, accountName: null, reason: err instanceof Error ? err.message.slice(0, 200) : "NETWORK_ERROR" };
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
 * which listVercelProjects's alias summary doesn't.
 */
export async function listVercelProjectDomains(token: string, projectIdOrName: string, fetcher: typeof fetch = fetch): Promise<VercelProjectDomain[]> {
  const response = await vercelFetch(token, `/v9/projects/${encodeURIComponent(projectIdOrName)}/domains`, fetcher);
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
