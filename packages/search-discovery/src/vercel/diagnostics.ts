import { validateVercelToken, listVercelProjects, listVercelProjectDomains, VercelApiError } from "./client.ts";
import { matchVercelProjectToWebsite, websiteMatchKey, type DiscoveredVercelProject } from "../website-input.ts";
import type { VercelTokenValidationResult } from "./types.ts";

/**
 * Internal Vercel connection diagnostic pipeline.
 *
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
 * 24: a customer reported "Your Vercel connection could not be authorized"
 * -- Update 23's INVALID_TOKEN classification, meaning the real Vercel API
 * genuinely returned 401/403 to this specific customer's real token (there
 * is no code-level bug in header construction or token normalization --
 * both client and server already trim, and vercelFetch's Authorization
 * header is exactly "Bearer <token>", confirmed by re-reading the current
 * source). That is a real, external fact about that specific token that
 * this codebase cannot override -- but two real, fixable gaps existed
 * alongside it:
 *
 * 1. NOTHING was ever recorded about a connect attempt, success or
 *    failure -- connectVercelWebsite() returned a reason to the HTTP
 *    caller and then discarded it. Fixed in connector.ts: every connect
 *    attempt now writes a real, sanitized audit_events row
 *    (SEARCH_VERCEL_CONNECT_ATTEMPTED).
 *
 * 2. There was no classification finer than "the token is valid" once
 *    validateVercelToken succeeded -- team/project/domain resolution
 *    (discoverVercelProjects) ran as a completely separate, later call
 *    with no combined diagnostic view, so "token valid but project
 *    missing" (section 9 of the brief this fixed) was never distinguished
 *    from a genuine token failure anywhere.
 *
 * Deliberately split into two stages, not one monolithic call:
 *   - classifyTokenValidation(): pure classification of an ALREADY-run
 *     validateVercelToken() result. Token-level only. This is what gates
 *     whether a connection is created at all.
 *   - diagnoseProjectAndDomainAccess(): the project/domain stage, given an
 *     already-known-valid token. NEVER throws and NEVER represents a
 *     connect failure -- a token that's valid but whose Vercel account has
 *     no matching project, or whose project-listing call itself hits a
 *     transient provider error, must still result in a successful
 *     connection (section 9). This stage is purely additional detail.
 *   - diagnoseVercelConnection(): the full pipeline, composing both, for
 *     the standalone "test the exact same path as production" case
 *     requested by this brief (section 5) -- runs the exact same
 *     production functions (validateVercelToken, listVercelProjects,
 *     listVercelProjectDomains), never a second/duplicate implementation.
 */
export type VercelDiagnosticClassification =
  | "TOKEN_INVALID"
  | "TOKEN_VALID_PERSONAL"
  | "TOKEN_VALID_TEAM"
  | "TEAM_ACCESS_MISSING"
  | "PROJECT_ACCESS_MISSING"
  | "PROJECT_NOT_FOUND"
  | "DOMAIN_NOT_FOUND"
  | "DOMAIN_MISMATCH"
  | "PROVIDER_ERROR"
  | "INTERNAL_ERROR";

export interface VercelDiagnosticResult {
  classification: VercelDiagnosticClassification;
  /** The specific upstream call that determined this classification, or
   * "NONE" once the full pipeline succeeds -- e.g. "GET /v2/user",
   * "GET /v10/projects", "GET /v9/projects/{id}/domains". Never includes
   * the token. */
  failingCall: string;
  httpStatus: number | null;
  accountId: string | null;
  accountName: string | null;
  teamId: string | null;
  matchedProjectId: string | null;
  matchedDomain: string | null;
}

interface DiagnosticProject extends DiscoveredVercelProject {
  externalProjectId: string;
}

const NOT_MATCHED: Pick<VercelDiagnosticResult, "matchedProjectId" | "matchedDomain"> = {
  matchedProjectId: null,
  matchedDomain: null,
};

/**
 * Token-level classification only -- given an already-run
 * validateVercelToken() result, never makes another API call. This is the
 * ONLY stage that should ever gate whether a connection is created:
 * INVALID/TEAM_ACCESS_MISSING/PROVIDER_ERROR/INTERNAL_ERROR here mean no
 * connection is made; TOKEN_VALID_PERSONAL/TOKEN_VALID_TEAM mean it is,
 * regardless of what any later project/domain lookup finds.
 */
export function classifyTokenValidation(validation: VercelTokenValidationResult): VercelDiagnosticClassification {
  if (validation.valid) return validation.teamId ? "TOKEN_VALID_TEAM" : "TOKEN_VALID_PERSONAL";
  switch (validation.reason) {
    case "TEAM_REQUIRED":
      return "TEAM_ACCESS_MISSING";
    case "PROVIDER_UNAVAILABLE":
      return "PROVIDER_ERROR";
    case "INTERNAL_ERROR":
      return "INTERNAL_ERROR";
    default:
      return "TOKEN_INVALID";
  }
}

/**
 * Project/domain stage ONLY, given an already-known-valid token (and its
 * resolved teamId, if any). Never throws, never fails a caller's connect
 * decision -- every real failure mode here (a transient provider error
 * listing projects, zero projects, a project's own domain lookup failing,
 * no project matching the target website) degrades to its own
 * classification instead. `targetWebsiteUrl` may be null (no canonical
 * website resolved yet); in that case, project access/existence is still
 * checked but domain matching is skipped.
 */
export async function diagnoseProjectAndDomainAccess(
  token: string,
  teamId: string | null,
  targetWebsiteUrl: string | null,
  fetcher: typeof fetch = fetch,
): Promise<{ classification: VercelDiagnosticClassification; failingCall: string; httpStatus: number | null } & Pick<VercelDiagnosticResult, "matchedProjectId" | "matchedDomain">> {
  let projects;
  try {
    projects = await listVercelProjects(token, { teamId: teamId ?? undefined, fetcher });
  } catch (err) {
    const status = err instanceof VercelApiError ? err.status : null;
    return { classification: status === 401 || status === 403 ? "PROJECT_ACCESS_MISSING" : "PROVIDER_ERROR", failingCall: "GET /v10/projects", httpStatus: status, ...NOT_MATCHED };
  }

  const validClassification: VercelDiagnosticClassification = teamId ? "TOKEN_VALID_TEAM" : "TOKEN_VALID_PERSONAL";

  if (projects.length === 0) {
    return { classification: "PROJECT_NOT_FOUND", failingCall: "GET /v10/projects", httpStatus: 200, ...NOT_MATCHED };
  }

  if (!targetWebsiteUrl) {
    return { classification: validClassification, failingCall: "NONE", httpStatus: 200, ...NOT_MATCHED };
  }

  let anyDomainDataRetrieved = false;
  const withDomains: DiagnosticProject[] = [];
  for (const project of projects) {
    try {
      const domains = await listVercelProjectDomains(token, project.externalProjectId, { teamId: teamId ?? undefined, fetcher });
      anyDomainDataRetrieved = true;
      withDomains.push({
        externalProjectId: project.externalProjectId,
        projectName: project.projectName,
        domains,
        framework: project.framework,
        lastDeploymentState: project.lastDeploymentState,
        lastDeploymentUrl: project.lastDeploymentUrl,
      });
    } catch {
      // Best-effort, matching discoverVercelProjects's existing tolerance
      // for one project's domain lookup failing -- don't fail the whole
      // diagnosis over one project's domain call.
    }
  }

  if (!anyDomainDataRetrieved) {
    return { classification: "DOMAIN_NOT_FOUND", failingCall: "GET /v9/projects/{id}/domains", httpStatus: null, ...NOT_MATCHED };
  }

  const matched = matchVercelProjectToWebsite(withDomains, targetWebsiteUrl);
  if (!matched) {
    return { classification: "DOMAIN_MISMATCH", failingCall: "GET /v9/projects/{id}/domains", httpStatus: 200, ...NOT_MATCHED };
  }

  const targetKey = websiteMatchKey(targetWebsiteUrl);
  const matchedDomainName =
    (matched.domains as Array<{ name?: unknown }>).find(
      (d) => typeof d?.name === "string" && websiteMatchKey(`https://${d.name}`) === targetKey,
    )?.name ?? null;

  return {
    classification: validClassification,
    failingCall: "NONE",
    httpStatus: 200,
    matchedProjectId: matched.externalProjectId,
    matchedDomain: typeof matchedDomainName === "string" ? matchedDomainName : null,
  };
}

/**
 * Full pipeline: token validation, then (only if genuinely valid) team
 * resolution, project discovery, and domain matching against
 * `targetWebsiteUrl` -- the same real functions production already uses
 * for connect/discover, called once each, never re-implemented. Never
 * throws for an external API failure; every real failure mode maps to one
 * of the ten classifications above instead. Never logs or returns the
 * token itself.
 *
 * This is the standalone diagnostic entry point (section 5 of the brief:
 * "test the exact same path as production, do not create a separate
 * diagnostic implementation") -- connectVercelWebsite does NOT call this
 * directly; it calls validateVercelToken + classifyTokenValidation to gate
 * the connect decision, then diagnoseProjectAndDomainAccess separately and
 * non-blockingly, since a project/domain-stage failure must never undo an
 * already-proven-valid token (section 9).
 */
export async function diagnoseVercelConnection(
  token: string,
  targetWebsiteUrl: string | null,
  fetcher: typeof fetch = fetch,
): Promise<VercelDiagnosticResult> {
  const validation = await validateVercelToken(token, fetcher);
  const tokenClassification = classifyTokenValidation(validation);
  if (!validation.valid) {
    return { classification: tokenClassification, failingCall: "GET /v2/user", httpStatus: null, accountId: null, accountName: null, teamId: null, ...NOT_MATCHED };
  }

  const identity = { accountId: validation.accountId, accountName: validation.accountName, teamId: validation.teamId };
  const projectResult = await diagnoseProjectAndDomainAccess(token, validation.teamId, targetWebsiteUrl, fetcher);
  return { ...identity, ...projectResult };
}
