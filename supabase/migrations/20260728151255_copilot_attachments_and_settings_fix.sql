-- Live Agent Workspace: canonical automation settings and private, owner-
-- scoped Copilot attachments. Additive except for replacing two stale CHECK
-- constraints/defaults with their canonical application semantics.

-- The application has always used MANUAL | SUPERVISED | AUTOPILOT. Production
-- still carried an older autonomy CHECK, which rejected AUTOPILOT writes.
alter table social_automation_settings
  drop constraint if exists social_automation_settings_autonomy_level_check;

update social_automation_settings
set autonomy_level = case
  when autonomy_level in ('FULL_AUTOPILOT', 'AUTONOMOUS') then 'AUTOPILOT'
  when autonomy_level not in ('MANUAL', 'SUPERVISED', 'AUTOPILOT') then 'MANUAL'
  else autonomy_level
end;

alter table social_automation_settings
  add constraint social_automation_settings_autonomy_level_check
  check (autonomy_level in ('MANUAL', 'SUPERVISED', 'AUTOPILOT'));

-- NULL = not configured, zero = explicitly disabled, positive = configured
-- ceiling. Removing the old zero defaults preserves that distinction.
alter table social_automation_settings
  alter column monthly_budget_cents drop not null,
  alter column monthly_budget_cents drop default,
  alter column monthly_ceiling_cents drop not null,
  alter column monthly_ceiling_cents drop default,
  alter column per_content_max_cents drop not null,
  alter column per_content_max_cents drop default;

create table if not exists social_agent_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references social_agent_sessions(id) on delete cascade,
  message_id uuid references social_agent_messages(id) on delete set null,
  run_id uuid references social_agent_runs(id) on delete set null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  processing_status text not null default 'UPLOADED' check (
    processing_status in ('UPLOADED', 'EXTRACTED', 'STORED_UNREADABLE', 'FAILED')
  ),
  extracted_text text,
  created_at timestamptz not null default now()
);

alter table social_agent_attachments enable row level security;
create index if not exists social_agent_attachments_session_idx
  on social_agent_attachments (session_id, created_at);
create index if not exists social_agent_attachments_message_idx
  on social_agent_attachments (message_id);

create policy social_agent_attachments_admin_owner
  on social_agent_attachments for all
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-agent-attachments',
  'social-agent-attachments',
  false,
  10485760,
  array[
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Paths are always owner/session/object. Folder ownership and the metadata
-- table both enforce the same user boundary.
create policy social_agent_attachment_objects_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'social-agent-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy social_agent_attachment_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'social-agent-attachments'
    and owner_id = (select auth.uid()::text)
  );

create policy social_agent_attachment_objects_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'social-agent-attachments'
    and owner_id = (select auth.uid()::text)
  );

-- Attachment access is operational telemetry. It says which user-visible
-- file was read; it never records extracted content or private reasoning.
alter table social_agent_run_events
  drop constraint if exists social_agent_run_events_type_check;
alter table social_agent_run_events
  add constraint social_agent_run_events_type_check check (type in (
    'RUN_STARTED', 'UNDERSTANDING_REQUEST',
    'ATTACHMENT_ACCESSED',
    'PROVIDER_REQUEST_STARTED', 'PROVIDER_RESPONSE_RECEIVED',
    'TOOL_STARTED', 'TOOL_COMPLETED', 'TOOL_FAILED',
    'APPROVAL_REQUIRED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED',
    'RUN_COMPLETED', 'RUN_FAILED'
  ));

grant select, insert, update, delete on social_agent_attachments to authenticated, service_role;
