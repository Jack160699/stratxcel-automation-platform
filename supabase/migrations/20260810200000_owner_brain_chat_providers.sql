-- Provider-level chat connections. Credentials remain opaque BYOK vault refs; imports store only normalized message content.
create table if not exists owner_chat_connections (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, provider_key text not null,
  display_name text not null, auth_mode text not null, capability text not null, status text not null default 'AUTH_REQUIRED',
  enabled boolean not null default true, encrypted_token_ref text, configuration jsonb not null default '{}'::jsonb,
  retention_days integer not null default 180, last_sync_at timestamptz, last_success_at timestamptz,
  health jsonb not null default '{}'::jsonb, last_error text, paused_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id, provider_key)
);
alter table owner_chat_connections enable row level security;
create policy owner_chat_connections_admin_owner on owner_chat_connections for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_chat_connections to authenticated;
grant select, insert, update, delete on owner_chat_connections to service_role;

create table if not exists owner_chat_imports (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, connection_id uuid not null references owner_chat_connections(id) on delete cascade,
  import_hash text not null, source_filename text, status text not null, conversation_count integer not null default 0,
  message_count integer not null default 0, last_error text, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(connection_id, import_hash)
);
alter table owner_chat_imports enable row level security;
create policy owner_chat_imports_admin_owner on owner_chat_imports for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_chat_imports to authenticated;
grant select, insert, update, delete on owner_chat_imports to service_role;

create table if not exists owner_chat_messages (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, connection_id uuid not null references owner_chat_connections(id) on delete cascade,
  import_id uuid references owner_chat_imports(id) on delete cascade, external_id text not null, conversation_external_id text not null,
  role text not null, content text not null, occurred_at timestamptz not null, provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique(connection_id, external_id)
);
alter table owner_chat_messages enable row level security;
create policy owner_chat_messages_admin_owner on owner_chat_messages for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_chat_messages to authenticated;
grant select, insert, update, delete on owner_chat_messages to service_role;

create table if not exists owner_chat_sync_cursors (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, connection_id uuid not null references owner_chat_connections(id) on delete cascade,
  scope_key text not null, cursor jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), unique(connection_id, scope_key)
);
alter table owner_chat_sync_cursors enable row level security;
create policy owner_chat_sync_cursors_admin_owner on owner_chat_sync_cursors for all to authenticated
  using (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())))
  with check (owner_id = (select auth.uid()) and exists (select 1 from stratxcel_admins a where a.user_id = (select auth.uid())));
grant select, insert, update, delete on owner_chat_sync_cursors to authenticated;
grant select, insert, update, delete on owner_chat_sync_cursors to service_role;
