drop policy if exists social_agent_messages_admin on public.social_agent_messages;
create policy social_agent_messages_admin
on public.social_agent_messages
for all
to authenticated
using (
  exists (
    select 1
    from public.social_agent_sessions s
    where s.id = social_agent_messages.session_id
      and s.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.social_agent_sessions s
    where s.id = social_agent_messages.session_id
      and s.owner_id = (select auth.uid())
  )
);

-- session_id is null previously bypassed ownership entirely (any authenticated
-- user could read/write any orphaned action row). Rows with no session now
-- match no authenticated-role policy at all, so only service_role (which
-- bypasses RLS) can reach them.
drop policy if exists social_agent_actions_admin on public.social_agent_actions;
create policy social_agent_actions_admin
on public.social_agent_actions
for all
to authenticated
using (
  session_id is not null
  and exists (
    select 1
    from public.social_agent_sessions s
    where s.id = social_agent_actions.session_id
      and s.owner_id = (select auth.uid())
  )
)
with check (
  session_id is not null
  and exists (
    select 1
    from public.social_agent_sessions s
    where s.id = social_agent_actions.session_id
      and s.owner_id = (select auth.uid())
  )
);
