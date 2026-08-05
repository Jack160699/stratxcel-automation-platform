-- Migration: Public Audit Requests Table & Security Controls
-- Secure intake table for unauthenticated public audit requests.

create table if not exists public_audit_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  contact_email text not null,
  contact_phone text,
  industry text,
  website_url text,
  goals text,
  source text not null default 'public_audit_page',
  status text not null default 'new' check (status in (
    'new',
    'contacted',
    'qualified',
    'paid',
    'audit_in_progress',
    'completed',
    'converted',
    'rejected'
  )),
  requested_product text not null default 'audit_fee',
  submitted_at timestamptz not null default now(),
  contacted_at timestamptz,
  converted_tenant_id uuid,
  internal_notes text,
  request_ip_hash text,
  user_agent text
);

-- Enable RLS
alter table public_audit_requests enable row level security;

-- Index for admin dashboard queries
create index if not exists public_audit_requests_submitted_idx on public_audit_requests (submitted_at desc);
create index if not exists public_audit_requests_status_idx on public_audit_requests (status, submitted_at desc);

-- Revoke all privileges from anon and authenticated roles by default
revoke all on public_audit_requests from anon, authenticated;

-- Grant access to service_role (for API route writes and operations)
grant select, insert, update, delete on public_audit_requests to service_role;

-- Grant select and update to authenticated users (admin view policy checks platform ownership in app logic or via platform_users/tenant_members)
grant select, update on public_audit_requests to authenticated;

-- RLS Policy: Authenticated users can read/update (gated at API/RPC layer for platform admin)
create policy public_audit_requests_auth_read on public_audit_requests for select
  to authenticated using (true);

create policy public_audit_requests_auth_update on public_audit_requests for update
  to authenticated using (true);
