-- REAL PRODUCTION BUG FOUND LIVE during Local AI certification (2026-09-05):
-- social_brand_profiles had exactly one RLS policy
-- (social_brand_profiles_admin_owner), scoped to owner_id = auth.uid() AND
-- an existing stratxcel_admins row -- i.e. StratXcel staff only. There was
-- NO policy granting a real tenant's own session (a tenant_members row)
-- read access to their own tenant's brand profile by tenant_id.
--
-- Effect on real customers: lib/social/repositories/brand.ts's
-- getBrandProfile() tenant-mode branch queries
-- `.from("social_brand_profiles").select("*").eq("tenant_id", ctx.tenantId)`
-- using the TENANT's OWN RLS-scoped session client (not service-role) --
-- this silently returned zero rows for every real tenant, regardless of how
-- much real brand data existed, degrading every tenant's Social Copilot
-- session to an all-empty DEFAULT_PROFILE. Reproduced live: the agent
-- called inspect_brand 8 times in a row (hitting MAX_TOOL_ROUNDS), got
-- {"products":0,"audiences":0,"content_pillars":0,...} every single time
-- despite a real, fully-populated profile existing for that tenant, and the
-- turn failed with "empty turn output".
--
-- Fix: add the missing tenant-member SELECT policy, following the exact
-- pattern already used by ai_execution_usage_tenant_read and
-- business_context_embeddings_tenant_read. Read-only -- all real writes to
-- this table already go through upsertBrandProfileForTenant's service-role
-- client, never a tenant session, so no write policy is needed.
create policy social_brand_profiles_tenant_read on social_brand_profiles for select
  using (
    exists (
      select 1 from tenant_members m
      where m.tenant_id = social_brand_profiles.tenant_id
        and m.user_id = (select auth.uid())
    )
  );
