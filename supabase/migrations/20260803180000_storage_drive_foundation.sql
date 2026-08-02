-- Google Drive / customer-owned storage foundation. Additive only.
-- Connections are created in 'disconnected' status and stay that way
-- until a real OAuth flow completes — nothing in this migration or the
-- code that uses it attempts a real Google login tonight.
create table if not exists storage_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null default 'google_drive' check (provider in ('google_drive', 'stratxcel_managed', 'onedrive', 'dropbox', 's3', 'r2', 'gcs', 'azure_blob')),
  account_email text,
  encrypted_token_ref text,
  scopes text[] not null default '{}',
  root_folder_id text,
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected', 'revoked', 'error')),
  last_error text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table storage_connections enable row level security;
create unique index if not exists storage_connections_tenant_provider_idx on storage_connections (tenant_id, provider);
create policy storage_connections_tenant_read on storage_connections for select
  using (exists (select 1 from tenant_members m where m.tenant_id = storage_connections.tenant_id and m.user_id = (select auth.uid())));

create table if not exists storage_file_references (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  storage_connection_id uuid not null references storage_connections(id) on delete cascade,
  provider_file_id text not null,
  folder_category text not null check (folder_category in (
    'brand_assets', 'source_uploads', 'social_media', 'campaigns', 'website', 'reports', 'proposals', 'legal_documents', 'archive'
  )),
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table storage_file_references enable row level security;
create index if not exists storage_file_references_tenant_idx on storage_file_references (tenant_id, folder_category);
create policy storage_file_references_tenant_read on storage_file_references for select
  using (exists (select 1 from tenant_members m where m.tenant_id = storage_file_references.tenant_id and m.user_id = (select auth.uid())));

grant select, insert, update, delete on storage_connections, storage_file_references to service_role;
grant select on storage_connections, storage_file_references to authenticated;
