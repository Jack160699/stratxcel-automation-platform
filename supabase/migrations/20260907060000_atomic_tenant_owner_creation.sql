-- Fixes a real, already-documented Blocker
-- (docs/product-design/FINAL_HARDENING_BACKLOG.md, "Onboarding & tenant
-- creation" #1): createTenant() (lib/tenants/repository.ts) inserted the
-- tenants row and the owner's tenant_members row as two separate
-- statements, not one transaction. A failure between them orphans a
-- tenant with no owner -- unreachable through any normal membership
-- resolution (listMyTenants, resolveCurrentTenant, the web client
-- switcher). Every real caller (the onboarding wizard, the audit
-- checkout/promo-redeem guest-tenant paths) inherited this risk.
--
-- Same security-definer + service-role-only pattern already established by
-- claim_social_package_post / settle_social_package_post
-- (20260810195000_social_package_autopilot_authorization.sql) --
-- lib/tenants/repository.ts's createTenant() already only ever runs with a
-- service-role client (its own type signature requires ServiceClient), so
-- this changes no caller-visible behavior, only makes the two inserts
-- atomic: a unique-slug violation on the tenants insert, or any failure on
-- the tenant_members insert, now rolls back the whole call -- no orphaned
-- tenant can ever be created.

create or replace function public.create_tenant_with_owner(
  p_slug text,
  p_name text,
  p_owner_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  insert into public.tenants (slug, name)
  values (p_slug, p_name)
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant.id, p_owner_user_id, 'owner');

  return jsonb_build_object(
    'id', v_tenant.id,
    'slug', v_tenant.slug,
    'name', v_tenant.name,
    'created_at', v_tenant.created_at,
    'updated_at', v_tenant.updated_at
  );
end;
$$;

revoke all on function public.create_tenant_with_owner(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_tenant_with_owner(text, text, uuid) to service_role;
