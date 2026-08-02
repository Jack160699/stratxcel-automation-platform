import { createSupabaseServiceClient } from "../supabase/service";
import type { TenantMemberRow, TenantRole, TenantRow } from "./types";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

export async function createTenant(
  supabase: ServiceClient,
  input: { slug: string; name: string; ownerUserId: string }
): Promise<TenantRow> {
  const { data: tenant, error } = await supabase
    .from("tenants")
    .insert({ slug: input.slug, name: input.name })
    .select("*")
    .single();
  if (error) throw new Error(`createTenant: ${error.message}`);

  const { error: memberError } = await supabase.from("tenant_members").insert({
    tenant_id: tenant.id,
    user_id: input.ownerUserId,
    role: "owner",
  });
  if (memberError) throw new Error(`createTenant: failed to add owner membership: ${memberError.message}`);

  return tenant as TenantRow;
}

export async function inviteMember(
  supabase: ServiceClient,
  input: { tenantId: string; userId: string; role: TenantRole; invitedBy: string }
): Promise<TenantMemberRow> {
  const { data, error } = await supabase
    .from("tenant_members")
    .insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      role: input.role,
      invited_by: input.invitedBy,
    })
    .select("*")
    .single();
  if (error) throw new Error(`inviteMember: ${error.message}`);
  return data as TenantMemberRow;
}

export async function listMembershipsForUser(
  supabase: ServiceClient,
  userId: string
): Promise<(TenantMemberRow & { tenant: TenantRow })[]> {
  const { data, error } = await supabase
    .from("tenant_members")
    .select("*, tenant:tenants(*)")
    .eq("user_id", userId);
  if (error) throw new Error(`listMembershipsForUser: ${error.message}`);
  return (data ?? []) as unknown as (TenantMemberRow & { tenant: TenantRow })[];
}

export async function getTenantBySlug(
  supabase: ServiceClient,
  slug: string
): Promise<TenantRow | null> {
  const { data, error } = await supabase.from("tenants").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`getTenantBySlug: ${error.message}`);
  return (data as TenantRow) ?? null;
}
