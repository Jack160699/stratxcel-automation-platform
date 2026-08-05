-- Migration: Authenticated AI Audit Jobs & Reports
-- Adds tenant_id, user_id, brand_brain_version, job_status, progress_percentage, report_data, evidence_data, and RLS policies.

alter table public_audit_requests
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists brand_brain_version integer default 1,
  add column if not exists job_status text not null default 'draft',
  add column if not exists progress_percentage integer not null default 0,
  add column if not exists report_data jsonb default '{}'::jsonb,
  add column if not exists evidence_data jsonb default '[]'::jsonb,
  add column if not exists error_message text,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

create index if not exists idx_public_audit_requests_tenant_id on public_audit_requests(tenant_id);
create index if not exists idx_public_audit_requests_user_id on public_audit_requests(user_id);
create index if not exists idx_public_audit_requests_job_status on public_audit_requests(job_status);

-- RLS Policy: Authenticated users can select audit requests belonging to their tenant
create policy "Authenticated users can select tenant audit requests"
  on public_audit_requests for select
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- RLS Policy: Authenticated users can insert audit requests for their tenant
create policy "Authenticated users can insert tenant audit requests"
  on public_audit_requests for insert
  to authenticated
  with check (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- RLS Policy: Authenticated users can update audit requests for their tenant
create policy "Authenticated users can update tenant audit requests"
  on public_audit_requests for update
  to authenticated
  using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where user_id = auth.uid()
    )
    or user_id = auth.uid()
  );
