import { createDevEncryptedVault, type SecretVault } from "@stratxcel/byok";
import { recordAuditEvent } from "@stratxcel/audit";
import { validateVercelToken, listVercelProjects, listVercelProjectDomains } from "./client.ts";
import { classifyTokenValidation, diagnoseProjectAndDomainAccess, type VercelDiagnosticClassification } from "./diagnostics.ts";
import type { WebsiteConnectionScope, VercelProjectSummary, VercelProjectDomain } from "./types.ts";
import { matchVercelProjectToWebsite, resolveCanonicalWebsite } from "../website-input.ts";
import type { SearchDb } from "../repository.ts";

/**
 * Vercel Website Connector.
 *
 * Real, live-verified engineering decision (see types.ts's top comment):
 * scoped Personal Access Token, not the full Marketplace/OAuth2
 * integration -- lower friction (no Vercel review), lower operational
 * complexity, no new StratXcel-side credential required at all (unlike
 * every other connector in this codebase, there is no
 * VERCEL_CLIENT_ID/SECRET to configure -- the customer generates and
 * supplies their own token; nothing for MANUAL_SETUP_REQUIRED.md to track
 * here beyond what the customer does themselves, which is inherent to the
 * feature, not a deployment blocker).
 *
 * Token storage: never the raw token in an application-readable table --
 * @stratxcel/byok's real, already-in-production AES-256-GCM vault
 * (vault_secrets), the same one every other real secret in this codebase
 * uses. This module never returns a decrypted token to a caller outside
 * itself.
 */

export interface ConnectVercelResult {
  ok: boolean;
  connectionId: string | null;
  accountName: string | null;
  reason: string | null;
  /** Populated only when ok is true -- one of the "token is genuinely
   * valid" diagnostic states (docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md,
   * Update 24). A valid token whose Vercel account has no matching
   * StratXcel project/domain yet is still a SUCCESSFUL connection
   * (section 9 of the brief this fixed: "token valid but project missing
   * is not a token failure") -- this field carries that extra, non-
   * blocking detail. Null when ok is false; `reason` carries the failure
   * cause in that case, unchanged from Update 23. */
  diagnosticState: VercelDiagnosticClassification | null;
}

function classificationToConnectFailureReason(classification: VercelDiagnosticClassification): string {
  switch (classification) {
    case "TEAM_ACCESS_MISSING":
      return "TEAM_REQUIRED";
    case "PROVIDER_ERROR":
      return "PROVIDER_UNAVAILABLE";
    case "INTERNAL_ERROR":
      return "INTERNAL_ERROR";
    case "TOKEN_INVALID":
    default:
      return "INVALID_TOKEN";
  }
}

/**
 * Root-caused via docs/discovery/SEARCH_GROWTH_ENGINE_GAP_AUDIT.md, Update
 * 24: a real customer's connect attempt failed with no trace of it
 * anywhere afterward -- connectVercelWebsite reported a reason to its
 * immediate HTTP caller and then discarded it. Every attempt (success or
 * failure) is now recorded as a real, sanitized audit_events row so a
 * future investigation of "trace the actual production request" has an
 * actual record, never nothing. Never includes the token -- only Vercel's
 * own non-secret identifiers (accountId, teamId) and the classification.
 */
async function recordConnectAttempt(
  db: SearchDb,
  input: {
    tenantId: string;
    connectedByUserId: string | null;
    connectionId: string | null;
    outcome: "succeeded" | "failed";
    classification: string;
    accountId: string | null;
    teamId: string | null;
    projectId?: string | null;
    /** Update 24, forensic pass: the real evidence behind the
     * classification -- GET /v2/user's own HTTP status and Vercel's own
     * safe, non-secret error envelope ({error:{code,message}}). Never the
     * token or the Authorization header. */
    endpoint?: string;
    httpStatus?: number | null;
    providerErrorCode?: string | null;
    providerErrorMessage?: string | null;
  },
) {
  try {
    await recordAuditEvent(db as any, {
      tenantId: input.tenantId,
      actorUserId: input.connectedByUserId,
      actorKind: input.connectedByUserId ? "user" : "system",
      action: "SEARCH_VERCEL_CONNECT_ATTEMPTED",
      targetType: "search_website_connection",
      targetId: input.connectionId ?? undefined,
      metadata: {
        outcome: input.outcome,
        classification: input.classification,
        accountId: input.accountId,
        teamId: input.teamId,
        projectId: input.projectId ?? null,
        endpoint: input.endpoint ?? "GET /v2/user",
        httpStatus: input.httpStatus ?? null,
        providerErrorCode: input.providerErrorCode ?? null,
        providerErrorMessage: input.providerErrorMessage ?? null,
      },
    });
  } catch {
    // Best-effort: a failure to WRITE the audit record must never fail
    // (or fabricate the outcome of) the real connect attempt itself.
  }
}

export async function connectVercelWebsite(
  db: SearchDb,
  input: { tenantId: string; connectedByUserId: string | null; token: string; scope?: WebsiteConnectionScope; fetcher?: typeof fetch; vault?: SecretVault },
): Promise<ConnectVercelResult> {
  // Update 24: gates purely on token-level validity, exactly as Update 23
  // did -- a downstream project/domain-stage problem (a transient Vercel
  // error listing projects, zero matching projects, no domain match) must
  // NEVER undo an already-proven-valid token (section 9 of the brief this
  // fixed: "token valid but project missing is not a token failure").
  const validation = await validateVercelToken(input.token, input.fetcher);
  const tokenClassification = classifyTokenValidation(validation);

  if (!validation.valid) {
    await recordConnectAttempt(db, {
      tenantId: input.tenantId,
      connectedByUserId: input.connectedByUserId,
      connectionId: null,
      outcome: "failed",
      classification: tokenClassification,
      accountId: null,
      teamId: null,
      httpStatus: validation.httpStatus,
      providerErrorCode: validation.providerErrorCode,
      providerErrorMessage: validation.providerErrorMessage,
    });
    return { ok: false, connectionId: null, accountName: null, reason: classificationToConnectFailureReason(tokenClassification), diagnosticState: null };
  }

  // Non-blocking: runs the same real listVercelProjects/listVercelProjectDomains
  // production functions (never a second/duplicate implementation) to
  // classify how much of the project/domain pipeline succeeds -- but
  // whatever it returns, the connection below is still created, because
  // the token itself is already proven valid.
  let canonicalWebsiteUrl: string | null = null;
  try {
    const canonical = await resolveCanonicalWebsite(db, input.tenantId);
    canonicalWebsiteUrl = canonical?.url ?? null;
  } catch {
    // best-effort -- domain matching just gets skipped
  }
  const projectDiagnosis = await diagnoseProjectAndDomainAccess(input.token, validation.teamId, canonicalWebsiteUrl, input.fetcher, validation.projectId);

  const vault = input.vault ?? createDevEncryptedVault(db as never);
  let tokenRef: string;
  try {
    tokenRef = await vault.store(input.token);
  } catch (err) {
    return { ok: false, connectionId: null, accountName: null, reason: err instanceof Error ? err.message : "VAULT_STORE_FAILED", diagnosticState: null };
  }

  const { data, error } = await db
    .from("search_website_connections")
    .upsert(
      {
        tenant_id: input.tenantId,
        provider: "vercel",
        token_vault_ref: tokenRef,
        scope: input.scope ?? "ANALYSIS_ONLY",
        external_account_id: validation.accountId,
        external_account_name: validation.accountName,
        // Update 19: only set for a Team-scoped token (validateVercelToken
        // resolves this via the /v2/teams fallback) -- null for a normal
        // "Full Account" personal token, matching Vercel's own model.
        team_id: validation.teamId,
        // Update 24: the additional, non-blocking project/domain
        // classification -- refreshed again on every discoverVercelProjects
        // call using the same already-fetched data, no extra API calls.
        diagnostic_state: projectDiagnosis.classification,
        is_healthy: true,
        last_verified_at: new Date().toISOString(),
        last_error: null,
        connected_by: input.connectedByUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,provider" },
    )
    .select("id")
    .single();

  if (error) {
    // Never leave an orphaned vault secret behind on a failed persist.
    try {
      await vault.revoke(tokenRef);
    } catch {
      // best-effort cleanup only -- the primary error below is what matters
    }
    return { ok: false, connectionId: null, accountName: null, reason: `CONNECTION_SAVE_FAILED: ${error.message}`, diagnosticState: null };
  }

  await recordConnectAttempt(db, {
    tenantId: input.tenantId,
    connectedByUserId: input.connectedByUserId,
    connectionId: data.id as string,
    outcome: "succeeded",
    classification: projectDiagnosis.classification,
    accountId: validation.accountId,
    teamId: validation.teamId,
    projectId: validation.projectId,
    endpoint: projectDiagnosis.failingCall,
    httpStatus: validation.httpStatus,
  });

  return { ok: true, connectionId: data.id as string, accountName: validation.accountName, reason: null, diagnosticState: projectDiagnosis.classification };
}

export async function disconnectVercelWebsite(db: SearchDb, input: { tenantId: string; vault?: SecretVault }): Promise<{ ok: boolean; reason: string | null }> {
  const { data: connection, error: fetchError } = await db
    .from("search_website_connections")
    .select("id, token_vault_ref")
    .eq("tenant_id", input.tenantId)
    .eq("provider", "vercel")
    .maybeSingle();

  if (fetchError) return { ok: false, reason: `CONNECTION_LOOKUP_FAILED: ${fetchError.message}` };
  if (!connection) return { ok: true, reason: null }; // already disconnected -- idempotent

  const vault = input.vault ?? createDevEncryptedVault(db as never);
  try {
    await vault.revoke(connection.token_vault_ref as string);
  } catch {
    // Best-effort: still remove the connection row even if vault revoke fails,
    // so the tenant isn't stuck "connected" to a token they asked to disconnect.
  }

  const { error: deleteError } = await db.from("search_website_connections").delete().eq("id", connection.id);
  if (deleteError) return { ok: false, reason: `CONNECTION_DELETE_FAILED: ${deleteError.message}` };
  return { ok: true, reason: null };
}

export interface DiscoverVercelProjectsResult {
  ok: boolean;
  projectCount: number;
  reason: string | null;
}

/**
 * Real project + domain discovery for an already-connected tenant.
 * Retrieves the token from the vault only for the duration of this call --
 * never returns it.
 */
export async function discoverVercelProjects(db: SearchDb, input: { tenantId: string; searchProjectId?: string | null; fetcher?: typeof fetch; vault?: SecretVault }): Promise<DiscoverVercelProjectsResult> {
  const { data: connection, error: fetchError } = await db
    .from("search_website_connections")
    .select("id, token_vault_ref, team_id")
    .eq("tenant_id", input.tenantId)
    .eq("provider", "vercel")
    .maybeSingle();

  if (fetchError) return { ok: false, projectCount: 0, reason: `CONNECTION_LOOKUP_FAILED: ${fetchError.message}` };
  if (!connection) return { ok: false, projectCount: 0, reason: "NOT_CONNECTED" };

  const vault = input.vault ?? createDevEncryptedVault(db as never);
  const token = await vault.retrieve(connection.token_vault_ref as string);
  if (!token) return { ok: false, projectCount: 0, reason: "TOKEN_UNAVAILABLE" };

  let projects;
  try {
    // Update 19: pass the stored team_id through when this connection was
    // authorized with a Team-scoped token -- listVercelProjects already
    // supported this, it just never received it before now.
    projects = await listVercelProjects(token, { teamId: (connection.team_id as string | null) ?? undefined, fetcher: input.fetcher });
  } catch (err) {
    await db.from("search_website_connections").update({ is_healthy: false, last_error: err instanceof Error ? err.message : "DISCOVERY_FAILED", updated_at: new Date().toISOString() }).eq("id", connection.id);
    return { ok: false, projectCount: 0, reason: err instanceof Error ? err.message : "DISCOVERY_FAILED" };
  }

  const now = new Date().toISOString();
  // Update 24: accumulated alongside the existing per-project persist loop
  // so the domain data already being fetched here can also refresh
  // diagnostic_state below -- zero extra Vercel API calls.
  const projectsWithDomains: Array<VercelProjectSummary & { domains: VercelProjectDomain[] }> = [];
  for (const project of projects) {
    // Real per-project domain verification status -- listVercelProjects's
    // own summary only carries assigned aliases, not verification state.
    let domains = project.domains;
    try {
      domains = await listVercelProjectDomains(token, project.externalProjectId, { teamId: (connection.team_id as string | null) ?? undefined, fetcher: input.fetcher });
    } catch {
      // Keep the alias-derived summary rather than failing the whole
      // discovery pass over one project's domain lookup.
    }
    projectsWithDomains.push({ ...project, domains });

    const { error } = await db
      .from("search_website_connection_projects")
      .upsert(
        {
          connection_id: connection.id,
          tenant_id: input.tenantId,
          external_project_id: project.externalProjectId,
          project_name: project.projectName,
          domains,
          framework: project.framework,
          last_deployment_state: project.lastDeploymentState,
          last_deployment_url: project.lastDeploymentUrl,
          last_discovered_at: now,
        },
        { onConflict: "connection_id,external_project_id" },
      );
    if (error) return { ok: false, projectCount: 0, reason: `PROJECT_SAVE_FAILED: ${error.message}` };
  }

  // Update 24: refresh diagnostic_state from the same real data just
  // fetched above -- the token was already known-valid to reach this line
  // (only a valid token's connection row exists at all), so this only
  // ever distinguishes PROJECT_NOT_FOUND / DOMAIN_MISMATCH /
  // TOKEN_VALID_PERSONAL / TOKEN_VALID_TEAM, matching
  // diagnoseVercelConnection's own classification for the same inputs
  // without a second live round-trip or a second matching implementation.
  let diagnosticState: string;
  if (projects.length === 0) {
    diagnosticState = "PROJECT_NOT_FOUND";
  } else {
    let canonicalWebsiteUrl: string | null = null;
    try {
      const canonical = await resolveCanonicalWebsite(db, input.tenantId);
      canonicalWebsiteUrl = canonical?.url ?? null;
    } catch {
      // best-effort
    }
    const isTeamToken = Boolean(connection.team_id);
    if (!canonicalWebsiteUrl) {
      diagnosticState = isTeamToken ? "TOKEN_VALID_TEAM" : "TOKEN_VALID_PERSONAL";
    } else {
      const matched = matchVercelProjectToWebsite(projectsWithDomains, canonicalWebsiteUrl);
      diagnosticState = matched ? (isTeamToken ? "TOKEN_VALID_TEAM" : "TOKEN_VALID_PERSONAL") : "DOMAIN_MISMATCH";
    }
  }

  await db.from("search_website_connections").update({ is_healthy: true, last_verified_at: now, last_error: null, diagnostic_state: diagnosticState, updated_at: now }).eq("id", connection.id);

  return { ok: true, projectCount: projects.length, reason: null };
}

export interface ProbeVercelWriteCapabilityResult {
  ok: boolean;
  /** The real, verified write capability state persisted into the DB. */
  capabilityState: "WRITE_READY" | "READ_ONLY" | "AUTH_FAILED" | "NOT_CONNECTED" | "ERROR";
  /** The scope value written to search_website_connections.scope -- or the existing scope if unchanged. */
  persistedScope: "AUTONOMOUS_WRITE" | "ANALYSIS_ONLY" | null;
  /** Non-secret diagnostic info about how the probe reached its conclusion. */
  reason: string;
  /** Vercel HTTP status from the write probe call. */
  probeHttpStatus: number | null;
}

/**
 * Safe, non-destructive real write capability probe using the customer's actual vaulted token.
 *
 * Mechanism: Vercel's POST /v13/deployments with deliberately minimal body.
 *   - If the token has write/deployment access: Vercel returns 400/422 (bad request -- missing
 *     required fields) confirming the token IS authorized to create deployments.
 *   - If the token is truly read-only: Vercel returns 403 (Forbidden).
 *   - Either way, no actual deployment is created -- the probe is non-destructive.
 *
 * This is the only truthful way to determine write capability: calling the actual Vercel API
 * with the actual customer credential. Scope metadata alone is insufficient since tokens
 * may have been created before scope metadata was stored, or with the wrong scope value.
 *
 * On success, persists the real scope into search_website_connections:
 *   - AUTONOMOUS_WRITE if write access confirmed
 *   - ANALYSIS_ONLY if genuinely read-only
 *
 * NEVER returns the token. NEVER logs it.
 */
export async function probeVercelWriteCapability(
  db: SearchDb,
  input: { tenantId: string; fetcher?: typeof fetch; vault?: SecretVault }
): Promise<ProbeVercelWriteCapabilityResult> {
  const { data: connection, error: fetchError } = await db
    .from("search_website_connections")
    .select("id, token_vault_ref, team_id, scope, is_healthy")
    .eq("tenant_id", input.tenantId)
    .eq("provider", "vercel")
    .maybeSingle();

  if (fetchError) {
    return { ok: false, capabilityState: "ERROR", persistedScope: null, reason: `CONNECTION_LOOKUP_FAILED: ${fetchError.message}`, probeHttpStatus: null };
  }
  if (!connection) {
    return { ok: false, capabilityState: "NOT_CONNECTED", persistedScope: null, reason: "No Vercel connection found for this tenant.", probeHttpStatus: null };
  }
  if (connection.is_healthy === false) {
    return { ok: false, capabilityState: "AUTH_FAILED", persistedScope: null, reason: "Existing connection is marked unhealthy. Reconnect with a valid token first.", probeHttpStatus: null };
  }

  const vault = input.vault ?? createDevEncryptedVault(db as never);
  let token: string | null = null;
  try {
    token = await vault.retrieve(connection.token_vault_ref as string);
  } catch {
    // Vault retrieval failed
  }

  if (!token) {
    return { ok: false, capabilityState: "AUTH_FAILED", persistedScope: null, reason: "Failed to retrieve customer token from vault.", probeHttpStatus: null };
  }

  // Safe, non-destructive write probe:
  // POST /v13/deployments with minimal body.
  // - Write-authorized token: 400 or 422 (token is valid but body is incomplete)
  // - Read-only token: 403 (Forbidden)
  // - Bad token: 401
  const fetcher = input.fetcher ?? fetch;
  const teamId = (connection.team_id as string | null) ?? null;
  const probeUrl = `https://api.vercel.com/v13/deployments${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;

  let probeStatus: number | null = null;
  let writeAuthorized = false;

  try {
    const probeResponse = await fetcher(probeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "_probe_check_only_no_deployment" }),
    });

    probeStatus = probeResponse.status;

    // 400/422 = token is authorized to write deployments but request body is incomplete/invalid
    // 403 = token is explicitly denied deployment write access
    // 401 = token is invalid/revoked (connection health needs update)
    if (probeStatus === 400 || probeStatus === 422 || probeStatus === 404) {
      // 404 can also mean authorized but project/team not found -- still authorized to call
      writeAuthorized = true;
    } else if (probeStatus === 403) {
      writeAuthorized = false;
    } else if (probeStatus === 401) {
      // Mark connection as unhealthy
      await db.from("search_website_connections")
        .update({ is_healthy: false, last_error: "Token rejected by Vercel (401)", updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      return { ok: false, capabilityState: "AUTH_FAILED", persistedScope: null, reason: "Token rejected by Vercel (401). Reconnect with a valid token.", probeHttpStatus: probeStatus };
    } else {
      // Unexpected status (5xx, etc) -- don't change scope, return error
      return { ok: false, capabilityState: "ERROR", persistedScope: connection.scope as "AUTONOMOUS_WRITE" | "ANALYSIS_ONLY", reason: `Unexpected probe response: HTTP ${probeStatus}`, probeHttpStatus: probeStatus };
    }
  } catch (err) {
    return { ok: false, capabilityState: "ERROR", persistedScope: null, reason: `Write probe network error: ${err instanceof Error ? err.message : String(err)}`, probeHttpStatus: null };
  }

  const newScope: "AUTONOMOUS_WRITE" | "ANALYSIS_ONLY" = writeAuthorized ? "AUTONOMOUS_WRITE" : "ANALYSIS_ONLY";
  const capabilityState = writeAuthorized ? "WRITE_READY" : "READ_ONLY";

  // Persist the truthful scope only if it changed
  if (connection.scope !== newScope) {
    const { error: updateError } = await db
      .from("search_website_connections")
      .update({
        scope: newScope,
        last_verified_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (updateError) {
      return { ok: false, capabilityState, persistedScope: null, reason: `Write probe succeeded but scope update failed: ${updateError.message}`, probeHttpStatus: probeStatus };
    }
  }

  const reason = writeAuthorized
    ? `Write probe confirmed: HTTP ${probeStatus} (Vercel accepted the token's write authorization before rejecting the incomplete deployment body). Scope persisted as AUTONOMOUS_WRITE.`
    : `Write probe returned HTTP 403 (Forbidden). This Vercel token does not have deployment write access. Scope persisted as ANALYSIS_ONLY. To enable automatic website changes, reconnect with a token that has deployment write permission.`;

  return { ok: true, capabilityState, persistedScope: newScope, reason, probeHttpStatus: probeStatus };
}

