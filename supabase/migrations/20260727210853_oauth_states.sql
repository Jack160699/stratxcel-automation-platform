-- social_oauth_states has no equivalent in the existing stratxcel schema —
-- required for CSRF-safe OAuth connect/callback (single-use, signed,
-- expiring state tokens). Backend-only (connect/callback routes always run
-- server-side via service-role); no owner-scoped RLS policy needed, same
-- posture as social_publishing_jobs writes.
create table if not exists social_oauth_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  state_hash text not null,
  redirect_to text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table social_oauth_states enable row level security;
create index if not exists social_oauth_states_hash_idx on social_oauth_states (state_hash);
