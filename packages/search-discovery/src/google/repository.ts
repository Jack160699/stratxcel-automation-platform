import type { SearchDb } from "../repository.ts";

export interface SearchGoogleConnectionRow {
  id: string;
  tenant_id: string;
  status: "disconnected" | "connecting" | "connected" | "revoked" | "error";
  encrypted_refresh_token_ref: string | null;
  granted_scopes: string[];
  last_error: string | null;
  connected_at: string | null;
  connected_by_user_id: string | null;
  search_console_site_url: string | null;
  search_console_last_synced_at: string | null;
  ga4_property_id: string | null;
  ga4_property_display_name: string | null;
  ga4_last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Tenant-scoped read. Never selects across tenants — every caller passes an already-authenticated tenantId. */
export async function getGoogleConnection(db: SearchDb, tenantId: string): Promise<SearchGoogleConnectionRow | null> {
  const { data, error } = await db.from("search_google_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(`SEARCH_GOOGLE_CONNECTION_READ_FAILED: ${error.message}`);
  return (data as SearchGoogleConnectionRow) ?? null;
}

export async function upsertGoogleConnectionStatus(
  db: SearchDb,
  input: {
    tenantId: string;
    status: SearchGoogleConnectionRow["status"];
    encryptedRefreshTokenRef?: string | null;
    grantedScopes?: string[];
    lastError?: string | null;
    connectedByUserId?: string | null;
  }
): Promise<SearchGoogleConnectionRow> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    tenant_id: input.tenantId,
    status: input.status,
    last_error: input.lastError ?? null,
    updated_at: now,
  };
  // Only touch these when the caller explicitly supplies them, so a status-only
  // update (e.g. marking 'error' after a failed refresh) never clobbers an
  // already-stored refresh token reference or scope list.
  if (input.encryptedRefreshTokenRef !== undefined) patch.encrypted_refresh_token_ref = input.encryptedRefreshTokenRef;
  if (input.grantedScopes !== undefined) patch.granted_scopes = input.grantedScopes;
  if (input.connectedByUserId !== undefined) patch.connected_by_user_id = input.connectedByUserId;
  if (input.status === "connected") patch.connected_at = now;

  const { data, error } = await db
    .from("search_google_connections")
    .upsert(patch, { onConflict: "tenant_id" })
    .select("*")
    .single();
  if (error) throw new Error(`SEARCH_GOOGLE_CONNECTION_SAVE_FAILED: ${error.message}`);
  return data as SearchGoogleConnectionRow;
}

export async function updateGoogleConnectionConfig(
  db: SearchDb,
  input: {
    tenantId: string;
    searchConsoleSiteUrl?: string | null;
    ga4PropertyId?: string | null;
    ga4PropertyDisplayName?: string | null;
  }
): Promise<SearchGoogleConnectionRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.searchConsoleSiteUrl !== undefined) patch.search_console_site_url = input.searchConsoleSiteUrl;
  if (input.ga4PropertyId !== undefined) patch.ga4_property_id = input.ga4PropertyId;
  if (input.ga4PropertyDisplayName !== undefined) patch.ga4_property_display_name = input.ga4PropertyDisplayName;

  const { data, error } = await db
    .from("search_google_connections")
    .update(patch)
    .eq("tenant_id", input.tenantId)
    .select("*")
    .single();
  if (error) throw new Error(`SEARCH_GOOGLE_CONFIG_SAVE_FAILED: ${error.message}`);
  return data as SearchGoogleConnectionRow;
}

export async function markGoogleSyncTime(db: SearchDb, tenantId: string, provider: "search_console" | "ga4"): Promise<void> {
  const column = provider === "search_console" ? "search_console_last_synced_at" : "ga4_last_synced_at";
  const { error } = await db.from("search_google_connections").update({ [column]: new Date().toISOString() }).eq("tenant_id", tenantId);
  if (error) throw new Error(`SEARCH_GOOGLE_SYNC_TIME_FAILED: ${error.message}`);
}

export async function disconnectGoogleConnection(db: SearchDb, tenantId: string): Promise<void> {
  const { error } = await db
    .from("search_google_connections")
    .update({
      status: "disconnected",
      encrypted_refresh_token_ref: null,
      granted_scopes: [],
      search_console_site_url: null,
      ga4_property_id: null,
      ga4_property_display_name: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`SEARCH_GOOGLE_DISCONNECT_FAILED: ${error.message}`);
}
