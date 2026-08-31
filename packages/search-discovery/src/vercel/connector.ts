import { createDevEncryptedVault, type SecretVault } from "@stratxcel/byok";
import { validateVercelToken, listVercelProjects, listVercelProjectDomains } from "./client.ts";
import type { WebsiteConnectionScope } from "./types.ts";
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
}

export async function connectVercelWebsite(
  db: SearchDb,
  input: { tenantId: string; connectedByUserId: string | null; token: string; scope?: WebsiteConnectionScope; fetcher?: typeof fetch; vault?: SecretVault },
): Promise<ConnectVercelResult> {
  const validation = await validateVercelToken(input.token, input.fetcher);
  if (!validation.valid) {
    return { ok: false, connectionId: null, accountName: null, reason: validation.reason };
  }

  const vault = input.vault ?? createDevEncryptedVault(db as never);
  let tokenRef: string;
  try {
    tokenRef = await vault.store(input.token);
  } catch (err) {
    return { ok: false, connectionId: null, accountName: null, reason: err instanceof Error ? err.message : "VAULT_STORE_FAILED" };
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
    return { ok: false, connectionId: null, accountName: null, reason: `CONNECTION_SAVE_FAILED: ${error.message}` };
  }

  return { ok: true, connectionId: data.id as string, accountName: validation.accountName, reason: null };
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
    .select("id, token_vault_ref")
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
    projects = await listVercelProjects(token, { fetcher: input.fetcher });
  } catch (err) {
    await db.from("search_website_connections").update({ is_healthy: false, last_error: err instanceof Error ? err.message : "DISCOVERY_FAILED", updated_at: new Date().toISOString() }).eq("id", connection.id);
    return { ok: false, projectCount: 0, reason: err instanceof Error ? err.message : "DISCOVERY_FAILED" };
  }

  const now = new Date().toISOString();
  for (const project of projects) {
    // Real per-project domain verification status -- listVercelProjects's
    // own summary only carries assigned aliases, not verification state.
    let domains = project.domains;
    try {
      domains = await listVercelProjectDomains(token, project.externalProjectId, input.fetcher);
    } catch {
      // Keep the alias-derived summary rather than failing the whole
      // discovery pass over one project's domain lookup.
    }

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

  await db.from("search_website_connections").update({ is_healthy: true, last_verified_at: now, last_error: null, updated_at: now }).eq("id", connection.id);

  return { ok: true, projectCount: projects.length, reason: null };
}
