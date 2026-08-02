import type { ServiceClient } from "./db.ts";
import { createDevEncryptedVault } from "./vault.ts";
import type { BillingMode, ProviderCapabilities, ProviderUsageEventRow, TenantProviderConnectionRow } from "./types.ts";

/**
 * Stores the raw key in the vault immediately and keeps only the
 * resulting ref — the plaintext never touches tenant_provider_connections,
 * and this function's return value (TenantProviderConnectionRow) has no
 * field that could leak it back to a caller, by construction.
 */
export async function createProviderConnection(
  supabase: ServiceClient,
  input: {
    tenantId: string;
    providerKey: string;
    rawSecret: string;
    billingMode?: BillingMode;
    capabilities?: ProviderCapabilities;
    monthlyLimitCents?: number;
    perMissionLimitCents?: number;
  }
): Promise<TenantProviderConnectionRow> {
  const vault = createDevEncryptedVault(supabase);
  const ref = await vault.store(input.rawSecret);

  const { data, error } = await supabase
    .from("tenant_provider_connections")
    .insert({
      tenant_id: input.tenantId,
      provider_key: input.providerKey,
      billing_mode: input.billingMode ?? "stratxcel_managed",
      encrypted_secret_ref: ref,
      capabilities: input.capabilities ?? {},
      monthly_limit_cents: input.monthlyLimitCents ?? null,
      per_mission_limit_cents: input.perMissionLimitCents ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`createProviderConnection: ${error.message}`);
  return data as TenantProviderConnectionRow;
}

export async function listProviderConnectionsForTenant(
  supabase: ServiceClient,
  tenantId: string
): Promise<TenantProviderConnectionRow[]> {
  const { data, error } = await supabase
    .from("tenant_provider_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listProviderConnectionsForTenant: ${error.message}`);
  return (data ?? []) as TenantProviderConnectionRow[];
}

export async function markConnectionValidated(
  supabase: ServiceClient,
  input: { connectionId: string; valid: boolean }
): Promise<TenantProviderConnectionRow> {
  const { data, error } = await supabase
    .from("tenant_provider_connections")
    .update({
      validation_status: input.valid ? "valid" : "invalid",
      last_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.connectionId)
    .select("*")
    .single();
  if (error) throw new Error(`markConnectionValidated: ${error.message}`);
  return data as TenantProviderConnectionRow;
}

/**
 * Revocation removes the vaulted secret entirely (not just a status flag)
 * — an attacker who somehow obtained database access after revocation
 * still can't recover a revoked key, because it no longer exists anywhere.
 */
export async function revokeProviderConnection(supabase: ServiceClient, connectionId: string): Promise<void> {
  const { data: connection, error: fetchError } = await supabase
    .from("tenant_provider_connections")
    .select("encrypted_secret_ref")
    .eq("id", connectionId)
    .single();
  if (fetchError) throw new Error(`revokeProviderConnection: ${fetchError.message}`);

  if (connection.encrypted_secret_ref) {
    const vault = createDevEncryptedVault(supabase);
    await vault.revoke(connection.encrypted_secret_ref);
  }

  const { error } = await supabase
    .from("tenant_provider_connections")
    .update({ validation_status: "revoked", revoked_at: new Date().toISOString(), encrypted_secret_ref: null })
    .eq("id", connectionId);
  if (error) throw new Error(`revokeProviderConnection: ${error.message}`);
}

export async function recordProviderUsage(
  supabase: ServiceClient,
  input: { tenantId: string; providerKey: string; missionId?: string | null; capability: string; units: number; costCents: number }
): Promise<ProviderUsageEventRow> {
  const { data, error } = await supabase
    .from("provider_usage_events")
    .insert({
      tenant_id: input.tenantId,
      provider_key: input.providerKey,
      mission_id: input.missionId ?? null,
      capability: input.capability,
      units: input.units,
      cost_cents: input.costCents,
    })
    .select("*")
    .single();
  if (error) throw new Error(`recordProviderUsage: ${error.message}`);
  return data as ProviderUsageEventRow;
}
