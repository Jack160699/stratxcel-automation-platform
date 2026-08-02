-- Phone-number-to-tenant routing for WhatsApp. Inbound messages are routed
-- by Meta's phone_number_id (the receiving business number's stable ID),
-- never by the sender's phone number — the sender is a customer/lead, not
-- a tenant, and phone_number_id is the one field Meta guarantees identifies
-- which WhatsApp Business number received the message.
create table if not exists whatsapp_phone_bindings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  waba_id text not null,
  phone_number_id text not null,
  display_phone_number text,
  provider_account_ref text,
  environment text not null default 'test' check (environment in ('test', 'staging', 'production')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled', 'revoked')),
  default_language text not null default 'en',
  timezone text not null default 'UTC',
  inbound_enabled boolean not null default false,
  outbound_enabled boolean not null default false,
  shadow_mode boolean not null default true,
  -- Never a raw token: this is a reference name into the secret vault
  -- (see packages/byok's vault abstraction), resolved to the actual
  -- WHATSAPP_TOKEN-equivalent only by trusted server code at send time.
  encrypted_credential_ref text,
  created_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table whatsapp_phone_bindings enable row level security;

-- A phone_number_id can have historical rows (disabled/revoked from a past
-- reconfiguration) but only one ACTIVE binding at a time — this is the
-- actual uniqueness the routing logic depends on.
create unique index if not exists whatsapp_phone_bindings_active_phone_idx
  on whatsapp_phone_bindings (phone_number_id)
  where status = 'active';
create index if not exists whatsapp_phone_bindings_tenant_idx on whatsapp_phone_bindings (tenant_id);

create policy whatsapp_phone_bindings_tenant_read on whatsapp_phone_bindings for select
  using (exists (select 1 from tenant_members m where m.tenant_id = whatsapp_phone_bindings.tenant_id and m.user_id = (select auth.uid())));

-- Every inbound webhook whose phone_number_id doesn't resolve to an active
-- binding lands here instead of being dropped or guessed at. "Redacted"
-- means the message body is truncated/hashed, not stored verbatim — this
-- table exists for ops visibility ("we're receiving traffic for an
-- unconfigured number"), not for reconstructing the conversation.
create table if not exists whatsapp_unmatched_events (
  id uuid primary key default gen_random_uuid(),
  phone_number_id text not null,
  waba_id text,
  provider_message_id text,
  body_excerpt text,
  body_length integer,
  received_at timestamptz not null default now()
);
alter table whatsapp_unmatched_events enable row level security;
create index if not exists whatsapp_unmatched_events_phone_idx on whatsapp_unmatched_events (phone_number_id, received_at desc);

-- No tenant-scoped read policy — by definition these events belong to no
-- tenant yet. Visible only to service_role (an operations/admin-only view
-- in a future superadmin surface, not a per-tenant one).

grant select, insert, update, delete on whatsapp_phone_bindings, whatsapp_unmatched_events to service_role;
grant select on whatsapp_phone_bindings to authenticated;
