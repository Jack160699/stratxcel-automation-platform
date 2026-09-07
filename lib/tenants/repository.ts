import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "../supabase/service.ts";
import type { TenantMemberRow, TenantRole, TenantRow } from "./types.ts";

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Any Supabase client capable of running a query — the service-role
 * client and the request-bound session client are both plain
 * SupabaseClient instances, differing only in which key (and therefore
 * which RLS behavior) they carry at runtime, not in their query-builder
 * shape. Used only for read operations verified against this project's
 * RLS policies (see supabase/migrations/20260803120000_platform_tenants_rbac_audit.sql:
 * tenant_members_self_read allows any authenticated user to select their
 * own membership rows, and tenants_member_read allows reading a tenant
 * they belong to) — genuinely privileged operations below stay typed as
 * ServiceClient.
 */
type ReadClient = SupabaseClient;

/**
 * Atomic via a real single-transaction Postgres RPC
 * (create_tenant_with_owner, security definer, service_role-only --
 * see supabase/migrations/20260907060000_atomic_tenant_owner_creation.sql).
 * Previously two separate insert statements — a documented Blocker
 * (docs/product-design/FINAL_HARDENING_BACKLOG.md, "Onboarding & tenant
 * creation" #1): a failure between them could orphan a tenant with no
 * owner, unreachable through any normal membership resolution. A failure
 * on either insert inside the RPC now rolls back both — live-verified via
 * a real transactional dry-run (forcing the second insert to fail leaves
 * zero rows in `tenants`), not just reasoned about. Error-message shape is
 * unchanged for every existing caller: a slug collision still raises
 * Postgres' own "duplicate key value violates unique constraint" text
 * (app/api/platform/onboarding/route.ts's retry-with-suffixed-slug path
 * matches on that substring and needs no change).
 */
export async function createTenant(
  supabase: ServiceClient,
  input: { slug: string; name: string; ownerUserId: string }
): Promise<TenantRow> {
  const { data, error } = await supabase.rpc("create_tenant_with_owner", {
    p_slug: input.slug,
    p_name: input.name,
    p_owner_user_id: input.ownerUserId,
  });
  if (error) throw new Error(`createTenant: ${error.message}`);
  return data as TenantRow;
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
  supabase: ReadClient,
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
