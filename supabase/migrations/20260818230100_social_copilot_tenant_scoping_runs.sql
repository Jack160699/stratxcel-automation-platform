-- Follow-up to 20260818230000_social_copilot_tenant_scoping.sql: the run/
-- run-event tables (social_agent_runs, social_agent_run_events) were missed
-- in that pass. Same join-based technique, no new columns -- both are
-- scoped purely via social_agent_sessions.tenant_id.

create policy social_agent_runs_tenant_member on social_agent_runs for all to authenticated
  using (
    exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_runs.session_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from social_agent_sessions s
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where s.id = social_agent_runs.session_id and tm.user_id = (select auth.uid())
    )
  );

create policy social_agent_run_events_tenant_member on social_agent_run_events for all to authenticated
  using (
    exists (
      select 1 from social_agent_runs r
      join social_agent_sessions s on s.id = r.session_id
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where r.id = social_agent_run_events.run_id and tm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from social_agent_runs r
      join social_agent_sessions s on s.id = r.session_id
      join tenant_members tm on tm.tenant_id = s.tenant_id
      where r.id = social_agent_run_events.run_id and tm.user_id = (select auth.uid())
    )
  );

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
