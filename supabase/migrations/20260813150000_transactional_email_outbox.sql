-- Migration: Transactional email durable outbox (V1).
-- Additive only. PII-bearing table — service_role writes only.
-- Authenticated clients must NOT insert arbitrary emails.
-- Customer UI may later read safe metadata via a gated API; no direct table grants to anon/authenticated.

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  owner_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  recipient text not null,
  recipient_hash text null,
  template_key text not null,
  template_version integer not null default 1,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  provider text null,
  provider_message_id text null,
  status text not null default 'PENDING'
    check (status in (
      'PENDING',
      'PROCESSING',
      'SENT',
      'RETRY_WAIT',
      'FAILED',
      'CANCELLED',
      'WAITING_CONFIGURATION'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz null,
  last_error_code text null,
  last_error_safe text null,
  sent_at timestamptz null,
  correlation_id text null,
  lease_owner text null,
  lease_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_outbox is
  'Durable transactional email outbox. Contains PII (recipient). Service-role only. Never mark SENT without a real provider message id.';

comment on column public.email_outbox.idempotency_key is
  'Caller-supplied idempotency fragment; uniqueness is (event_type, idempotency_key, recipient).';

comment on column public.email_outbox.payload is
  'Safe template payload plus _rendered html/text. Must not store API keys or payment secrets.';

comment on column public.email_outbox.provider_message_id is
  'Real provider message id after successful send. Null until provider success.';

-- Unique idempotency: webhook retry must not send the same receipt twice.
create unique index if not exists email_outbox_idempotency_unique_idx
  on public.email_outbox (event_type, idempotency_key, recipient);

create index if not exists email_outbox_claim_idx
  on public.email_outbox (status, next_attempt_at, created_at)
  where status in ('PENDING', 'RETRY_WAIT', 'PROCESSING');

create index if not exists email_outbox_tenant_created_idx
  on public.email_outbox (tenant_id, created_at desc)
  where tenant_id is not null;

create index if not exists email_outbox_provider_message_idx
  on public.email_outbox (provider, provider_message_id)
  where provider_message_id is not null;

alter table public.email_outbox enable row level security;

-- No policies for anon/authenticated — service_role bypasses RLS.
-- Explicit revoke against inherited default privileges regressions.
revoke all on table public.email_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.email_outbox to service_role;

-- Atomic claim for the outbox processor (lease + PROCESSING).
create or replace function public.claim_email_outbox_batch(
  p_limit integer default 10,
  p_lease_owner text default 'email-processor',
  p_lease_seconds integer default 120
)
returns setof public.email_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_lease interval := make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 600)));
begin
  return query
  with candidates as (
    select e.id
    from public.email_outbox e
    where (
        e.status in ('PENDING', 'RETRY_WAIT')
        and e.next_attempt_at <= now()
      )
      or (
        e.status = 'PROCESSING'
        and e.lease_expires_at is not null
        and e.lease_expires_at < now()
      )
    order by e.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.email_outbox e
  set status = 'PROCESSING',
      lease_owner = p_lease_owner,
      lease_expires_at = now() + v_lease,
      last_attempt_at = now(),
      updated_at = now()
  from candidates c
  where e.id = c.id
  returning e.*;
end;
$$;

revoke all on function public.claim_email_outbox_batch(integer, text, integer) from public, anon, authenticated;
grant execute on function public.claim_email_outbox_batch(integer, text, integer) to service_role;

comment on function public.claim_email_outbox_batch(integer, text, integer) is
  'Atomically claims pending/retry/stale email_outbox rows for the transactional email processor. service_role only.';
