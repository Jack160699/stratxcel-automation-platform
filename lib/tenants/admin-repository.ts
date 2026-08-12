import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { listMissionsForTenant } from "@stratxcel/missions";
import { listPendingApprovals } from "@stratxcel/approvals";
import { getWalletAccount } from "@stratxcel/payments-and-wallet";
import { listPhoneBindingsForTenant } from "@stratxcel/whatsapp";

export interface AgencyTenant {
  tenantId: string;
  name: string;
  slug: string;
}

function mapTenant(row: { id: string; name: string; slug: string }): AgencyTenant {
  return { tenantId: row.id, name: row.name, slug: row.slug };
}

/** Server-only agency tenant listing. Callers must authenticate with requireOwnerContext first. */
export async function listAgencyTenants(): Promise<AgencyTenant[]> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.from("tenants").select("id,name,slug").order("name");
  if (error) throw new Error(`listAgencyTenants: ${error.message}`);
  return (data ?? []).map(mapTenant);
}

/** Server-only existence/detail lookup. Callers must authenticate with requireOwnerContext first. */
export async function getAgencyTenant(tenantId: string): Promise<AgencyTenant | null> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.from("tenants").select("id,name,slug").eq("id", tenantId).maybeSingle();
  if (error) throw new Error(`getAgencyTenant: ${error.message}`);
  return data ? mapTenant(data) : null;
}

/** Creates an agency-managed tenant without fabricating a staff customer membership. */
export async function createAgencyTenant(input: { slug: string; name: string }): Promise<AgencyTenant> {
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("tenants")
    .insert({ slug: input.slug, name: input.name })
    .select("id,name,slug")
    .single();
  if (error) throw new Error(`createAgencyTenant: ${error.message}`);
  return mapTenant(data);
}

/** Narrow cross-tenant overview used only after the admin page re-authenticates staff. */
export async function loadAgencyClientOverview(tenantId: string) {
  const service = createSupabaseServiceClient();
  const tenant = await getAgencyTenant(tenantId);
  if (!tenant) return null;
  const [missions, approvals, wallet, bindings] = await Promise.all([
    listMissionsForTenant(service, tenantId, 10),
    listPendingApprovals(service, tenantId),
    getWalletAccount(service, tenantId),
    listPhoneBindingsForTenant(service, tenantId),
  ]);
  return { tenant, missions, approvals, wallet, bindings };
}
