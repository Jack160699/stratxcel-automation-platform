-- Migration: Website project version history, richer domain lifecycle state,
-- and an atomic site-project version/approval RPC.
-- Additive only. Does not touch reconcile_and_fulfill_razorpay_payment_v4,
-- process_refund_atomic_v11, or any other previously-applied payment RPC.

-- ============================================================
-- 1. SITE_PROJECTS — additive columns + widened status vocabulary
-- ============================================================

alter table site_projects
  add column if not exists business_input jsonb not null default '{}'::jsonb,
  add column if not exists generation_spec jsonb not null default '{}'::jsonb,
  add column if not exists approved_version_id uuid,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists current_version_id uuid,
  add column if not exists production_url text,
  add column if not exists preview_deployment_id text;

-- Widened, not replaced: old values (preview/in_revision/published) stay
-- valid for existing rows; new code uses the fuller lifecycle vocabulary
-- going forward ('generating' is reserved for when generation becomes an
-- async job — today it completes synchronously, so new rows start at
-- 'preview_ready' directly).
alter table site_projects drop constraint if exists site_projects_status_check;
alter table site_projects add constraint site_projects_status_check
  check (status in (
    'draft', 'preview', 'in_revision', 'approved', 'published', -- legacy values, kept for existing rows
    'generating', 'preview_ready', 'revision_requested', 'deploying', 'live', 'failed', 'archived'
  ));

-- ============================================================
-- 2. SITE_PROJECT_VERSIONS — append-only history
-- ============================================================

create table if not exists site_project_versions (
  id uuid primary key default gen_random_uuid(),
  site_project_id uuid not null references site_projects(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  version_number integer not null,
  status_at_creation text not null,
  pages jsonb not null,
  revision_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table site_project_versions enable row level security;
create unique index if not exists site_project_versions_number_unique_idx
  on site_project_versions (site_project_id, version_number);
create index if not exists site_project_versions_tenant_idx
  on site_project_versions (tenant_id, created_at desc);
create policy site_project_versions_tenant_read on site_project_versions for select
  using (exists (select 1 from tenant_members m where m.tenant_id = site_project_versions.tenant_id and m.user_id = (select auth.uid())));
grant select, insert, update, delete on site_project_versions to service_role;
grant select on site_project_versions to authenticated;

-- Now that site_project_versions exists, point the two version-reference columns at it.
alter table site_projects
  add constraint site_projects_approved_version_fk foreign key (approved_version_id) references site_project_versions(id) on delete set null,
  add constraint site_projects_current_version_fk foreign key (current_version_id) references site_project_versions(id) on delete set null;

-- ============================================================
-- 3. DOMAINS — richer Vercel/DNS lifecycle + renewal/transfer-out state
-- ============================================================

alter table domains
  add column if not exists vercel_attachment_status text not null default 'not_started'
    check (vercel_attachment_status in ('not_started', 'pending_dns', 'verifying', 'ssl_pending', 'live', 'failed')),
  add column if not exists dns_expected jsonb not null default '[]'::jsonb,
  add column if not exists dns_observed jsonb not null default '[]'::jsonb,
  add column if not exists auto_renew boolean not null default false,
  add column if not exists quote_expires_at timestamptz,
  add column if not exists last_registrar_sync_at timestamptz,
  add column if not exists transfer_out_status text
    check (transfer_out_status is null or transfer_out_status in ('requested', 'in_progress', 'completed', 'denied')),
  add column if not exists transfer_out_requested_at timestamptz;

-- ============================================================
-- 4. ATOMIC SITE-PROJECT VERSION + APPROVAL RPC
--
-- Central write path for the website lifecycle: creates an immutable version
-- snapshot (when p_pages is supplied) and transitions site_projects.status
-- atomically, so a crash between "record the version" and "update the
-- pointer" cannot happen. approved_version_id only ever changes on an
-- explicit 'approve' action — no other action can silently move what
-- production considers approved, and a draft/failed generation can never
-- become the approved pointer by accident.
-- ============================================================

create or replace function public.apply_site_project_version(
  p_site_project_id uuid,
  p_tenant_id uuid,
  p_action text, -- 'generate' | 'revision' | 'approve' | 'mark_deploying' | 'mark_live' | 'mark_failed' | 'archive'
  p_pages jsonb default null,
  p_notes text default null,
  p_custom_domain text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project record;
  v_new_version record;
  v_next_version_number integer;
  v_new_status text;
begin
  select * into v_project from site_projects where id = p_site_project_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'site_project_not_found');
  end if;

  if v_project.tenant_id <> p_tenant_id then
    return jsonb_build_object('success', false, 'reason', 'tenant_mismatch');
  end if;

  if p_action not in ('generate', 'revision', 'approve', 'mark_deploying', 'mark_live', 'mark_failed', 'archive') then
    return jsonb_build_object('success', false, 'reason', 'invalid_action');
  end if;

  -- Revision limit enforced here too (defense in depth alongside the TS-level check).
  if p_action = 'revision' and v_project.revision_count >= 1 then
    return jsonb_build_object('success', false, 'reason', 'revision_limit_reached');
  end if;

  v_new_status := case p_action
    when 'generate' then 'preview_ready'
    when 'revision' then 'revision_requested'
    when 'approve' then 'approved'
    when 'mark_deploying' then 'deploying'
    when 'mark_live' then 'live'
    when 'mark_failed' then 'failed'
    when 'archive' then 'archived'
  end;

  -- A draft/failed/archived project can never be approved or marked live directly.
  if p_action in ('approve') and v_project.status not in ('preview', 'preview_ready', 'revision_requested', 'in_revision') then
    return jsonb_build_object('success', false, 'reason', 'not_approvable_from_current_status', 'status', v_project.status);
  end if;

  if p_pages is not null then
    select coalesce(max(version_number), 0) + 1 into v_next_version_number
    from site_project_versions where site_project_id = p_site_project_id;

    insert into site_project_versions (site_project_id, tenant_id, version_number, status_at_creation, pages, revision_notes, created_by)
    values (p_site_project_id, p_tenant_id, v_next_version_number, v_new_status, p_pages, p_notes, p_actor_user_id)
    returning * into v_new_version;
  end if;

  update site_projects
  set status = v_new_status,
      pages = coalesce(p_pages, pages),
      current_version_id = coalesce(v_new_version.id, current_version_id),
      revision_notes = case when p_action = 'revision' then p_notes else revision_notes end,
      revision_count = case when p_action = 'revision' then revision_count + 1 else revision_count end,
      custom_domain = coalesce(p_custom_domain, custom_domain),
      -- approved_version_id/approved_by/approved_at only ever move on an explicit approve.
      approved_version_id = case when p_action = 'approve' then coalesce(v_new_version.id, current_version_id) else approved_version_id end,
      approved_by = case when p_action = 'approve' then p_actor_user_id else approved_by end,
      approved_at = case when p_action = 'approve' then now() else approved_at end,
      published_at = case when p_action = 'mark_live' then now() else published_at end,
      updated_at = now()
  where id = p_site_project_id;

  return jsonb_build_object(
    'success', true,
    'site_project_id', p_site_project_id,
    'status', v_new_status,
    'version_id', v_new_version.id,
    'version_number', v_new_version.version_number
  );
end;
$$;

revoke all on function public.apply_site_project_version(uuid, uuid, text, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_site_project_version(uuid, uuid, text, jsonb, text, text, uuid) to service_role;
