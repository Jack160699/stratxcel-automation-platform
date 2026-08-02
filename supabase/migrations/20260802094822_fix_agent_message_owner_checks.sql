drop policy if exists social_agent_messages_admin on public.social_agent_messages;
create policy social_agent_messages_admin
on public.social_agent_messages
for all
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

drop policy if exists social_agent_actions_admin on public.social_agent_actions;
create policy social_agent_actions_admin
on public.social_agent_actions
for all
using (
  session_id is null
  or exists (
    select 1
    from public.social_agent_sessions s
    where s.id = social_agent_actions.session_id
      and s.owner_id = (select auth.uid())
  )
)
with check (
  session_id is null
  or exists (
    select 1
    from public.social_agent_sessions s
    where s.id = social_agent_actions.session_id
      and s.owner_id = (select auth.uid())
  )
);
