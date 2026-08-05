-- Migration: Audit Questionnaire Expansion & Durable Rate Limiting
-- Adds multi-step audit questionnaire schema and atomic distributed rate limiting function.

-- 1. Add Questionnaire Columns to public_audit_requests
alter table public_audit_requests
  add column if not exists audit_answers jsonb not null default '{}'::jsonb,
  add column if not exists questionnaire_version text not null default 'v2_multistep',
  add column if not exists completion_percentage integer not null default 100,
  add column if not exists preferred_contact_method text,
  add column if not exists preferred_contact_time text,
  add column if not exists consent_to_contact boolean not null default true,
  add column if not exists consent_recorded_at timestamptz not null default now();

-- 2. Durable Rate Limiting Table
create table if not exists public_audit_rate_limits (
  ip_hash text primary key,
  request_count integer not null default 1,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public_audit_rate_limits enable row level security;
revoke all on public_audit_rate_limits from anon, authenticated;
grant select, insert, update, delete on public_audit_rate_limits to service_role;

-- 3. Atomic Rate Limiter RPC
create or replace function check_and_increment_audit_rate_limit(
  p_ip_hash text,
  p_max_requests integer default 5,
  p_window_seconds integer default 900 -- 15 minutes
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
begin
  select window_start, request_count
    into v_window_start, v_count
    from public_audit_rate_limits
   where ip_hash = p_ip_hash
   for update;

  if not found then
    insert into public_audit_rate_limits (ip_hash, request_count, window_start, updated_at)
    values (p_ip_hash, 1, v_now, v_now);
    return true;
  end if;

  -- If window expired, reset counter and window start
  if v_now - v_window_start > (p_window_seconds || ' seconds')::interval then
    update public_audit_rate_limits
       set request_count = 1,
           window_start = v_now,
           updated_at = v_now
     where ip_hash = p_ip_hash;
    return true;
  end if;

  -- Check if limit exceeded
  if v_count >= p_max_requests then
    return false;
  end if;

  -- Increment counter
  update public_audit_rate_limits
     set request_count = request_count + 1,
         updated_at = v_now
   where ip_hash = p_ip_hash;

  return true;
end;
$$;

grant execute on function check_and_increment_audit_rate_limit to service_role;
