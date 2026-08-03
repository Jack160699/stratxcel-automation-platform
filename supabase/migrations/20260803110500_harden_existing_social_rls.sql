-- Corrective migration: production policy inspection found (a) unnecessary
-- dangerous privileges standing on every public-schema table for anon and
-- authenticated, and (b) four RLS policies (plus several looser role scopes)
-- on the already-deployed Social Autopilot tables that predate this session.
-- Editing the historical migrations that first defined these (see
-- 20260727210513_social_autopilot_schema_delta.sql,
-- 20260727211405_workflows.sql, 20260728120000_social_agent_run_events.sql,
-- 20260728151255_copilot_attachments_and_settings_fix.sql, and
-- 20260802094822_fix_agent_message_owner_checks.sql — all now updated to
-- match the definitions below) only fixes *fresh* installs; a database this
-- already ran against keeps the old grant/policy until something explicitly
-- undoes it. This migration is that undo, ordered after
-- 20260803110000_revoke_unsafe_default_privileges.sql and before
-- 20260803120000_platform_tenants_rbac_audit.sql so the new platform tables
-- are created on top of an already-hardened public schema.

-- ============================================================
-- 1. Revoke unnecessary dangerous privileges from existing public tables.
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN have no legitimate client use case —
-- a signed-in user has no reason to truncate a table, add a foreign key
-- constraint referencing it, fire a trigger definition, or run VACUUM/
-- ANALYZE-class maintenance from the API. SELECT/INSERT/UPDATE/DELETE are
-- deliberately left alone: existing application flows authorize DML through
-- RLS policies, not through withholding the base grant, so revoking those
-- globally would break every RLS-gated read/write in the app. service_role
-- and supabase_admin-owned defaults are untouched.
-- ============================================================
revoke truncate, references, trigger, maintain
on all tables in schema public
from authenticated, anon;

-- ============================================================
-- 2. Fix A: social_agent_actions_admin — `session_id is null` used to
-- bypass ownership entirely, handing any authenticated user read/write on
-- every orphaned action row. Rows with a null session_id now match no
-- authenticated-role policy at all, so only service_role (RLS bypass) can
-- reach them.
-- ============================================================
drop policy if exists social_agent_actions_admin on social_agent_actions;
create policy social_agent_actions_admin
on social_agent_actions
for all
to authenticated
using (
  session_id is not null
  and exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_actions.session_id
      and s.owner_id = (select auth.uid())
  )
)
with check (
  session_id is not null
  and exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_actions.session_id
      and s.owner_id = (select auth.uid())
  )
);

-- ============================================================
-- 2. Fix B: social_conversations_admin — `account_id is null` used to
-- bypass ownership entirely. Rows with a null account_id now match no
-- authenticated-role policy; service_role only.
-- ============================================================
drop policy if exists social_conversations_admin on social_conversations;
create policy social_conversations_admin
on social_conversations
for all
to authenticated
using (
  account_id is not null
  and exists (
    select 1 from social_accounts a
    where a.id = social_conversations.account_id
      and a.owner_id = (select auth.uid())
  )
)
with check (
  account_id is not null
  and exists (
    select 1 from social_accounts a
    where a.id = social_conversations.account_id
      and a.owner_id = (select auth.uid())
  )
);

-- ============================================================
-- 2. Fix C: social_leads_admin — same account-ownership correction as
-- social_conversations_admin.
-- ============================================================
drop policy if exists social_leads_admin on social_leads;
create policy social_leads_admin
on social_leads
for all
to authenticated
using (
  account_id is not null
  and exists (
    select 1 from social_accounts a
    where a.id = social_leads.account_id
      and a.owner_id = (select auth.uid())
  )
)
with check (
  account_id is not null
  and exists (
    select 1 from social_accounts a
    where a.id = social_leads.account_id
      and a.owner_id = (select auth.uid())
  )
);

-- ============================================================
-- 2. Fix D: social_messages_admin — previously verified only that the
-- parent conversation row existed (any conversation, owned by anyone),
-- never that the caller owned the account behind it. Now traces
-- conversation -> account -> owner_id all the way to auth.uid().
-- ============================================================
drop policy if exists social_messages_admin on social_messages;
create policy social_messages_admin
on social_messages
for all
to authenticated
using (exists (
  select 1 from social_conversations c
  join social_accounts a on a.id = c.account_id
  where c.id = social_messages.conversation_id
    and c.account_id is not null
    and a.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from social_conversations c
  join social_accounts a on a.id = c.account_id
  where c.id = social_messages.conversation_id
    and c.account_id is not null
    and a.owner_id = (select auth.uid())
));

-- ============================================================
-- 3. Narrow the remaining social_* policies from role PUBLIC (the implicit
-- default when a migration's CREATE POLICY had no `TO` clause) to
-- `authenticated`. Every one of these already keys its USING/WITH CHECK
-- condition on auth.uid() — they were never intended to be reachable by an
-- unauthenticated `anon` request, PUBLIC just happened to be the default
-- when no role list was written. The single intentional anonymous-access
-- policy in this project, stratxcel_contact_public_insert (contact form
-- lead capture), is defined outside this migration set and is untouched by
-- this migration.
-- ============================================================
drop policy if exists social_agent_sessions_admin_owner on social_agent_sessions;
create policy social_agent_sessions_admin_owner on social_agent_sessions for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

drop policy if exists social_agent_messages_admin on social_agent_messages;
create policy social_agent_messages_admin on social_agent_messages for all to authenticated
  using (exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_messages.session_id and s.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_messages.session_id and s.owner_id = (select auth.uid())
  ));

drop policy if exists social_provider_configs_admin_owner on social_provider_configs;
create policy social_provider_configs_admin_owner on social_provider_configs for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

drop policy if exists social_health_checks_admin_read on social_health_checks;
create policy social_health_checks_admin_read on social_health_checks for select to authenticated
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

drop policy if exists social_audit_events_admin_read on social_audit_events;
create policy social_audit_events_admin_read on social_audit_events for select to authenticated
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

drop policy if exists social_webhook_events_admin_read on social_webhook_events;
create policy social_webhook_events_admin_read on social_webhook_events for select to authenticated
  using (exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

drop policy if exists social_automations_admin_owner on social_automations;
create policy social_automations_admin_owner on social_automations for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));

drop policy if exists social_automation_runs_admin on social_automation_runs;
create policy social_automation_runs_admin on social_automation_runs for select to authenticated
  using (exists (select 1 from social_automations a where a.id = social_automation_runs.automation_id and a.owner_id = (select auth.uid())));

drop policy if exists social_agent_runs_admin on social_agent_runs;
create policy social_agent_runs_admin on social_agent_runs for all to authenticated
  using (exists (
    select 1 from social_agent_sessions s
    where s.id = social_agent_runs.session_id and s.owner_id = (select auth.uid())
  ));

drop policy if exists social_agent_run_events_admin on social_agent_run_events;
create policy social_agent_run_events_admin on social_agent_run_events for all to authenticated
  using (exists (
    select 1 from social_agent_runs r
    join social_agent_sessions s on s.id = r.session_id
    where r.id = social_agent_run_events.run_id and s.owner_id = (select auth.uid())
  ));

drop policy if exists social_agent_attachments_admin_owner on social_agent_attachments;
create policy social_agent_attachments_admin_owner
  on social_agent_attachments for all to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from social_agent_sessions s
      where s.id = social_agent_attachments.session_id
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from social_agent_sessions s
      where s.id = social_agent_attachments.session_id
        and s.owner_id = (select auth.uid())
    )
  );
