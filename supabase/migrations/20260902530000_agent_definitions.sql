-- Agent Factory (master brief: dynamic runtime agent composition with
-- governed permissions/skills/connections). This is the real, persisted
-- backing store for a governed agent definition -- a named, narrower tool
-- subset a staff member can dispatch a turn to, instead of always the full
-- default agent. See lib/agent-core/agent-definitions.ts,
-- lib/agent-core/agent-factory-tools.ts, lib/agent-core/agent-dispatch.ts.
--
-- v1 scope, deliberately: staff-created and staff-dispatched only (no
-- per-tenant/client-created agents yet -- tenant_id stays null for every
-- row in v1; the column exists so a future client-facing extension doesn't
-- need a schema migration, but nothing in this pass writes a non-null
-- value). Governed by a real subset check enforced in
-- agent-factory-tools.ts's create_agent_definition: every requested tool
-- name must already be in the creating principal's own real, permission-
-- filtered tool set -- never a privilege escalation.

create table if not exists public.agent_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  department text,
  allowed_tool_names text[] not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  created_by uuid,
  created_by_principal_kind text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_definitions_key_shape check (key ~ '^[a-z0-9_-]{2,40}$'),
  -- coalesce(...,0), not a bare array_length() > 0: Postgres' array_length()
  -- returns NULL (not 0) for an empty array, and a CHECK constraint treats
  -- NULL as "not violated" -- a bare array_length(...) > 0 check silently
  -- ADMITS an empty allowed_tool_names array. Found live via a real
  -- transactional dry-run insert before this table had any real rows, and
  -- fixed here before it could ever ship with the gap.
  constraint agent_definitions_nonempty_tools check (coalesce(array_length(allowed_tool_names, 1), 0) > 0)
);

create index if not exists idx_agent_definitions_status on public.agent_definitions(status);

alter table public.agent_definitions enable row level security;
-- Service-role only, same posture as audit_share_tokens and every other
-- table this agent runtime reads/writes directly -- no browser client ever
-- touches this table.
grant select, insert, update on public.agent_definitions to service_role;
revoke all on public.agent_definitions from public, anon, authenticated;
