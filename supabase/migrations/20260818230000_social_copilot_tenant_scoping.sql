-- Social Copilot tenant scoping.
--
-- Additive, non-destructive. Adds a parallel tenant-owned mode to the
-- existing owner-scoped (StratXcel-staff-only) Social Copilot data model,
-- without touching any existing row or existing policy.
--
-- Existing social_agent_sessions/content_master rows (36 sessions, 22
-- content_master rows as of this migration) are internal StratXcel-staff
-- data created via the admin Social Copilot — they are NOT customer data
-- and are never reassigned to a tenant here. owner_id stays NOT NULL's
-- functional meaning ("this row belongs to StratXcel staff"); tenant_id is
-- new, nullable, and mutually exclusive with owner_id via a CHECK
-- constraint, so a row is unambiguously either legacy-owner-scoped or
-- tenant-scoped, never both, never neither.
--
-- Child tables (social_agent_messages, social_agent_actions,
-- content_variants) get NO new column — tenant isolation for them is
-- enforced by a join-based RLS policy back to their parent's tenant_id,
-- the same technique the existing *_admin policies already use for
-- owner_id (see 20260727210513_social_autopilot_schema_delta.sql). This
-- avoids a second, independently-maintained scoping column that could
-- drift from its parent and create a bypass path.

-- ============================================================
-- social_agent_sessions
-- ============================================================

alter table social_agent_sessions alter column owner_id drop not null;
alter table social_agent_sessions add column if not exists tenant_id uuid references tenants(id) on delete cascade;

alter table social_agent_sessions
  add constraint social_agent_sessions_scope_check
  check ((owner_id is not null) <> (tenant_id is not null));

create index if not exists social_agent_sessions_tenant_idx
  on social_agent_sessions (tenant_id, updated_at desc)
  where tenant_id is not null;

create policy social_agent_sessions_tenant_member on social_agent_sessions for all to authenticated
  using (
    tenant_id is not null
    and exists (
      select 1 from tenant_members tm
      where tm.tenant_id = social_agent_sessions.tenant_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    tenant_id is not null
    and exists (
      select 1 from tenant_members tm
      where tm.tenant_id = social_agent_sessions.tenant_id and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- social_agent_messages (scoped via parent session's tenant_id)
-- ============================================================

create policy social_agent_messages_tenant_member on social_agent_messages for all to authenticated
  using (
    exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_messages.session_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_messages.session_id and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- social_agent_actions (scoped via parent session's tenant_id)
-- ============================================================

create policy social_agent_actions_tenant_member on social_agent_actions for all to authenticated
  using (
    session_id is not null
    and exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_actions.session_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    session_id is not null
    and exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_actions.session_id and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- content_master
-- ============================================================

alter table content_master alter column owner_id drop not null;
alter table content_master add column if not exists tenant_id uuid references tenants(id) on delete cascade;

alter table content_master
  add constraint content_master_scope_check
  check ((owner_id is not null) <> (tenant_id is not null));

create index if not exists content_master_tenant_idx
  on content_master (tenant_id, updated_at desc)
  where tenant_id is not null;

create policy content_master_tenant_member on content_master for all to authenticated
  using (
    tenant_id is not null
    and exists (
      select 1 from tenant_members tm
      where tm.tenant_id = content_master.tenant_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    tenant_id is not null
    and exists (
      select 1 from tenant_members tm
      where tm.tenant_id = content_master.tenant_id and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- content_variants (scoped via parent content_master's tenant_id)
-- ============================================================

create policy content_variants_tenant_member on content_variants for all to authenticated
  using (
    exists (
      select 1 from content_master m
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where m.id = content_variants.master_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from content_master m
      join tenant_members tm on tm.tenant_id = m.tenant_id
      where m.id = content_variants.master_id and tm.user_id = (select auth.uid())
    )
  );

-- ============================================================
-- Atomic action claim RPC: tenant-aware sibling of claim_social_agent_action.
-- Mirrors its owner-scoped logic exactly (PROPOSED -> target, single-row
-- conditional update) but authorizes via tenant_members membership on the
-- action's session instead of session.owner_id = p_owner_id.
-- ============================================================

create or replace function public.claim_social_agent_action_tenant(
  p_action_id uuid,
  p_tenant_id uuid,
  p_target_status text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if p_target_status not in ('EXECUTING', 'REJECTED') then
    raise exception 'invalid target status';
  end if;

  -- security definer bypasses RLS, so the caller's own tenant membership is
  -- verified explicitly here rather than relying only on the session join —
  -- the same defense-in-depth claim_social_agent_action already uses for
  -- p_owner_id against auth.uid().
  if current_user <> 'service_role'
     and not exists (
       select 1 from public.tenant_members tm
       where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
     )
  then
    return false;
  end if;

  update public.social_agent_actions a
  set status = p_target_status,
      updated_at = now()
  from public.social_agent_sessions s
  where a.id = p_action_id
    and a.session_id = s.id
    and s.tenant_id = p_tenant_id
    and a.status = 'PROPOSED';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_social_agent_action_tenant(uuid, uuid, text) from public;
grant execute on function public.claim_social_agent_action_tenant(uuid, uuid, text) to authenticated, service_role;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
