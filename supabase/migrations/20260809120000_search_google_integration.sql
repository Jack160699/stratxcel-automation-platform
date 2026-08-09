-- Google OAuth integration for Search & Discovery (Search Console + GA4).
-- Additive only; NOT applied automatically. Do not apply to production.
--
-- One Google OAuth authorization per tenant can cover both read-only
-- surfaces (Search Console + GA4) — see packages/search-discovery/src/google/oauth.ts
-- for the verified scopes. This table intentionally lives OUTSIDE the
-- search_* measurement/analysis tables (search_projects, search_analysis_runs,
-- search_measurement_snapshots, ...): OAuth credentials must never sit
-- alongside analysis data, and no column here is ever readable by the
-- browser as a usable secret.
--
-- Mirrors the storage_connections / vault_secrets pattern already used for
-- Google Drive (see 20260803180000_storage_drive_foundation.sql and
-- packages/byok/src/vault.ts): only an opaque reference into vault_secrets
-- is stored here (encrypted_refresh_token_ref), never a raw token. The
-- 'authenticated' role can SELECT this table's non-secret columns (status,
-- selected properties, timestamps) so the tenant's own UI can render
-- connection state, exactly like storage_connections already does — but
-- vault_secrets itself grants 'authenticated' nothing, so the ref column is
-- useless to a browser client even if it can read it.
create table if not exists search_google_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,

  -- OAuth connection state (one Google account per tenant for this feature).
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected', 'revoked', 'error')),
  encrypted_refresh_token_ref text,
  granted_scopes text[] not null default '{}',
  last_error text,
  connected_at timestamptz,
  connected_by_user_id uuid references auth.users(id) on delete set null,

  -- Search Console property selection (site URL, as returned by sites.list).
  search_console_site_url text,
  search_console_last_synced_at timestamptz,

  -- GA4 property selection (numeric property ID, as returned by
  -- accountSummaries.list's propertySummaries[].property = "properties/{id}").
  ga4_property_id text,
  ga4_property_display_name text,
  ga4_last_synced_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table search_google_connections enable row level security;

create policy search_google_connections_tenant_read on search_google_connections for select
  using (exists (select 1 from tenant_members m where m.tenant_id = search_google_connections.tenant_id and m.user_id = (select auth.uid())));

revoke all on search_google_connections from public, anon;
grant select on search_google_connections to authenticated;
grant select, insert, update, delete on search_google_connections to service_role;

create index if not exists search_google_connections_tenant_idx on search_google_connections (tenant_id);

-- Bounded, normalized measurement periods. search_measurement_snapshots
-- already has period_start/period_end columns (20260809020000) that were
-- unused by the initial runtime scaffold — this lets real GSC/GA4 reads
-- record their actual bounded window (e.g. a trailing 28 days) rather than
-- leaving those columns permanently null.
comment on column search_measurement_snapshots.period_start is 'Start of the bounded data window a provider snapshot covers (e.g. GSC/GA4 28-day read). Null for providers that are not window-based.';
comment on column search_measurement_snapshots.period_end is 'End of the bounded data window a provider snapshot covers. Null for providers that are not window-based.';
