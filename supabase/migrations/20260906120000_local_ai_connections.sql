-- StratXcel Admin -> Local AI connection interface (2026-09-06).
--
-- Persists the pairing exchange with the owner's remote, self-hosted
-- "StratXcel Unified Local AI Server" (see packages/ai-runtime/src/
-- providers/local-ai.ts's header comment: a FastAPI service paired via a
-- one-time POST /v1/pair exchange that hands back a long-lived
-- machine_api_key). Before this migration, that key only ever existed as a
-- manually-set LOCAL_AI_API_KEY Vercel env var -- there was no persistent,
-- admin-visible record of the pairing itself, no stored history of who
-- paired it or when, and no way to re-verify or reconnect without a human
-- re-running a one-off script. This table is the missing persistence layer
-- the admin connection UI (app/admin/(shell)/system/local-ai) and its
-- backing API routes (app/api/admin/system/local-ai/*) read and write.
--
-- Admin-only, not tenant-scoped -- there is exactly one real Local AI
-- machine today. Re-pairing never overwrites history: the previous active
-- row is deactivated (is_active=false) and a new row is inserted, so who
-- paired what and when remains auditable. Exactly one row may have
-- is_active=true at a time (enforced by the partial unique index below).
create table if not exists public.local_ai_connections (
  id uuid primary key default gen_random_uuid(),

  -- Real state confirmed at pairing/health-check time -- never invented.
  machine_name text,
  machine_id text,
  api_url text not null,

  -- The real machine_api_key never lives in this table directly -- it is
  -- stored via @stratxcel/byok's existing createDevEncryptedVault
  -- (AES-256-GCM, BYOK_VAULT_ENCRYPTION_KEY) in vault_secrets, the exact
  -- same mechanism the Owner Brain Companion device-pairing flow already
  -- uses for its own bearer token (lib/owner-brain/repositories/
  -- desktop-devices.ts) -- reused rather than inventing a second
  -- secret-at-rest mechanism for one more integration's token.
  encrypted_token_ref uuid not null references public.vault_secrets(id),

  status text not null default 'DISCONNECTED'
    check (status in ('CONNECTED', 'DISCONNECTED', 'RECONNECTING', 'ERROR')),

  -- Split, not collapsed: a Cloudflare-tunnel-down response (real, observed
  -- live: HTTP 530 with a Cloudflare HTML error page, not a StratXcel API
  -- response) is a materially different failure from "the tunnel is up but
  -- the FastAPI process/model behind it is unhealthy" -- the admin UI's own
  -- "Tunnel status" / "API status" fields read these two independently.
  tunnel_reachable boolean not null default false,
  api_reachable boolean not null default false,
  model_available boolean not null default false,
  model_status jsonb not null default '{}'::jsonb,

  last_paired_at timestamptz,
  last_seen_at timestamptz,
  last_checked_at timestamptz,
  last_error text,

  -- The raw /v1/pair success body, kept verbatim (never assumed) in case
  -- the server's real field names ever drift from machine_api_key/
  -- machine_name -- lets a real pairing be diagnosed from stored data
  -- alone, without needing to reproduce it live to see what changed.
  raw_pair_response jsonb,

  paired_by_user_id uuid,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active connection at a time -- the admin UI and the health
-- check job both read/write "the current connection" as a singleton.
create unique index if not exists local_ai_connections_one_active
  on public.local_ai_connections ((true))
  where is_active;

create index if not exists local_ai_connections_active_lookup
  on public.local_ai_connections (is_active, created_at desc);

alter table public.local_ai_connections enable row level security;
revoke all on public.local_ai_connections from public, anon, authenticated;
grant select, insert, update, delete on public.local_ai_connections to service_role;
