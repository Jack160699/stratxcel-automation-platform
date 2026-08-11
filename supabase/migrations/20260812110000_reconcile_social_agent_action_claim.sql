-- Additive reconciliation for claim_social_agent_action.
-- Production may already have the live function while migration history lacks
-- 20260810170000_social_whatsapp_bridge. This migration is idempotent and does
-- NOT insert a fake historical migration row.
-- DO NOT apply to production from this coding task without an explicit ops change.

create or replace function public.claim_social_agent_action(
  p_action_id uuid,
  p_owner_id uuid,
  p_target_status text
)
returns boolean
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
  if current_user <> 'service_role' and auth.uid() is distinct from p_owner_id then
    return false;
  end if;

  -- Only active PROPOSED rows may be claimed. SUPERSEDED / REJECTED / SUCCEEDED
  -- / FAILED / EXECUTING are never executable through this RPC.
  update public.social_agent_actions a
  set status = p_target_status,
      updated_at = now()
  from public.social_agent_sessions s
  where a.id = p_action_id
    and a.session_id = s.id
    and s.owner_id = p_owner_id
    and a.status = 'PROPOSED';

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_social_agent_action(uuid, uuid, text) from public;
grant execute on function public.claim_social_agent_action(uuid, uuid, text) to authenticated, service_role;

-- Optional PostgREST schema-cache nudge (supported NOTIFY). Safe no-op if unused.
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
