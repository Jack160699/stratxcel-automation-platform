-- Tenant Media & Publishing unblocking migration.
-- Additive RLS policies for tenant members to access attachments,
-- media assets, content media associations, publishing jobs, and dead letters.

-- ============================================================
-- 1. social_agent_attachments (tenant session scoping)
-- ============================================================

create policy social_agent_attachments_tenant_member
  on social_agent_attachments for all to authenticated
  using (
    exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_attachments.session_id
        and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_attachments.session_id
        and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- 2. social_media_assets (tenant scoping for uploads & attachments)
-- ============================================================

create policy social_media_assets_tenant_member
  on social_media_assets for all to authenticated
  using (
    tenant_id is not null
    and exists (
      select 1 from tenant_members tm
      where tm.tenant_id = social_media_assets.tenant_id
        and tm.user_id = (select auth.uid())
    )
  )
  with check (
    tenant_id is not null
    and exists (
      select 1 from tenant_members tm
      where tm.tenant_id = social_media_assets.tenant_id
        and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- 3. social_content_master_media (tenant scoping via content_master)
-- ============================================================

create policy social_content_master_media_tenant_member
  on social_content_master_media for all to authenticated
  using (
    exists (
      select 1 from content_master m
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where m.id = social_content_master_media.master_id
        and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from content_master m
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where m.id = social_content_master_media.master_id
        and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- 4. social_content_variant_media (tenant scoping via content_variants)
-- ============================================================

create policy social_content_variant_media_tenant_member
  on social_content_variant_media for all to authenticated
  using (
    exists (
      select 1 from content_variants v
      join content_master m on m.id = v.master_id
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where v.id = social_content_variant_media.variant_id
        and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from content_variants v
      join content_master m on m.id = v.master_id
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where v.id = social_content_variant_media.variant_id
        and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- 5. social_publishing_jobs (tenant member read scoping)
-- ============================================================

create policy social_publishing_jobs_tenant_member
  on social_publishing_jobs for select to authenticated
  using (
    exists (
      select 1 from content_variants v
      join content_master m on m.id = v.master_id
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where v.id = social_publishing_jobs.variant_id
        and tm.user_id = (select auth.uid())
    )
    or exists (
      select 1 from social_accounts a
      join tenant_members tm on tm.tenant_id = a.tenant_id
      where a.id = social_publishing_jobs.account_id
        and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- 6. social_dead_letters (tenant member read scoping)
-- ============================================================

create policy social_dead_letters_tenant_member
  on social_dead_letters for select to authenticated
  using (
    exists (
      select 1 from social_publishing_jobs j
      join content_variants v on v.id = j.variant_id
      join content_master m on m.id = v.master_id
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where j.id = social_dead_letters.job_id
        and tm.user_id = (select auth.uid())
    )
  );

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
