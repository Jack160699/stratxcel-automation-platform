-- Stratxcel Image Generation + Creative Studio V1.
-- Durable tenant-scoped jobs, references, candidates, selection, critique,
-- provenance and downstream Social/Workforce linkage. Provider secrets and
-- temporary provider URLs are deliberately never persisted here.

create table image_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  mission_id uuid references missions(id) on delete set null,
  source_context text not null default 'creative_studio'
    check (source_context in ('creative_studio','social_copilot','social_autopilot','workforce','campaign','website')),
  source_id text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','QUEUED','PROCESSING','REVIEWING','REVISING','READY','FAILED')),
  brief text not null check (char_length(brief) between 1 and 4000),
  normalized_prompt text check (normalized_prompt is null or char_length(normalized_prompt) <= 12000),
  intended_use text not null default 'social_post'
    check (intended_use in ('social_post','campaign','website','ad_creative','general')),
  aspect_ratio text not null default '1:1' check (aspect_ratio in ('1:1','4:5','9:16','16:9')),
  candidate_count integer not null default 2 check (candidate_count between 1 and 4),
  style_direction text check (style_direction is null or char_length(style_direction) <= 500),
  brand_brain_version integer,
  brand_context_snapshot jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  provider_request_id text,
  selected_candidate_id uuid,
  estimated_cost_usd numeric(12,6),
  actual_cost_usd numeric(12,6),
  usage_accounting_status text check (usage_accounting_status is null or usage_accounting_status in ('RECORDED','FAILED','SKIPPED')),
  error_code text,
  safe_error text,
  error_retryable boolean,
  revision_count integer not null default 0 check (revision_count between 0 and 3),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, actor_user_id, idempotency_key),
  unique (id, tenant_id)
);

-- Composite ownership keys let the database reject a candidate/reference
-- whose media asset belongs to another tenant, even on service-role writes.
alter table social_media_assets
  add constraint social_media_assets_id_tenant_key unique (id, tenant_id);

create table image_generation_references (
  job_id uuid not null,
  tenant_id uuid not null,
  asset_id uuid not null,
  reference_kind text not null default 'existing_asset'
    check (reference_kind in ('uploaded','existing_asset','logo','product','prior_generated')),
  created_at timestamptz not null default now(),
  primary key (job_id, asset_id),
  foreign key (job_id, tenant_id) references image_generation_jobs(id, tenant_id) on delete cascade,
  foreign key (asset_id, tenant_id) references social_media_assets(id, tenant_id) on delete restrict
);

create table image_generation_candidates (
  id uuid primary key,
  job_id uuid not null,
  tenant_id uuid not null,
  asset_id uuid not null,
  parent_candidate_id uuid references image_generation_candidates(id) on delete set null,
  status text not null default 'GENERATED'
    check (status in ('GENERATED','REVIEWED','SELECTED','REJECTED','REVISION')),
  revision_number integer not null default 0 check (revision_number between 0 and 3),
  provider text not null,
  model text not null,
  provider_output_id text,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  estimated_cost_usd numeric(12,6),
  critique jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, asset_id),
  unique (id, job_id, tenant_id),
  foreign key (job_id, tenant_id) references image_generation_jobs(id, tenant_id) on delete cascade,
  foreign key (asset_id, tenant_id) references social_media_assets(id, tenant_id) on delete restrict
);

alter table image_generation_jobs
  add constraint image_generation_jobs_selected_candidate_fk
  foreign key (selected_candidate_id, id, tenant_id)
  references image_generation_candidates(id, job_id, tenant_id)
  deferrable initially deferred;

alter table social_media_assets
  add column if not exists source_type text not null default 'upload'
    check (source_type in ('upload','attachment','generated'));
alter table social_media_assets
  add column if not exists generation_job_id uuid references image_generation_jobs(id) on delete set null;
alter table social_media_assets
  add column if not exists provenance jsonb not null default '{}'::jsonb;

create index image_generation_jobs_tenant_created_idx
  on image_generation_jobs (tenant_id, created_at desc);
create index image_generation_jobs_tenant_status_idx
  on image_generation_jobs (tenant_id, status, updated_at desc);
create index image_generation_jobs_mission_idx
  on image_generation_jobs (mission_id) where mission_id is not null;
create index image_generation_candidates_job_idx
  on image_generation_candidates (job_id, created_at);
create index image_generation_candidates_asset_idx
  on image_generation_candidates (asset_id);
create index image_generation_references_tenant_idx
  on image_generation_references (tenant_id, created_at desc);
create index social_media_assets_generation_job_idx
  on social_media_assets (generation_job_id) where generation_job_id is not null;

alter table image_generation_jobs enable row level security;
alter table image_generation_references enable row level security;
alter table image_generation_candidates enable row level security;

create policy image_generation_jobs_tenant_read on image_generation_jobs for select
  to authenticated
  using (exists (
    select 1 from tenant_members m
    where m.tenant_id = image_generation_jobs.tenant_id
      and m.user_id = (select auth.uid())
  ));

create policy image_generation_references_tenant_read on image_generation_references for select
  to authenticated
  using (exists (
    select 1 from tenant_members m
    where m.tenant_id = image_generation_references.tenant_id
      and m.user_id = (select auth.uid())
  ));

create policy image_generation_candidates_tenant_read on image_generation_candidates for select
  to authenticated
  using (exists (
    select 1 from tenant_members m
    where m.tenant_id = image_generation_candidates.tenant_id
      and m.user_id = (select auth.uid())
  ));

-- Generated media is a tenant asset, while existing owner-scoped mutation
-- policies remain unchanged. Preview/download still goes through a signed URL.
create policy social_media_assets_tenant_generated_read on social_media_assets for select
  to authenticated
  using (
    source_type = 'generated'
    and tenant_id is not null
    and exists (
      select 1 from tenant_members m
      where m.tenant_id = social_media_assets.tenant_id
        and m.user_id = (select auth.uid())
    )
  );

revoke all on image_generation_jobs, image_generation_references, image_generation_candidates
  from public, anon;
grant select on image_generation_jobs, image_generation_references, image_generation_candidates
  to authenticated;
grant select, insert, update, delete on image_generation_jobs, image_generation_references, image_generation_candidates
  to service_role;

comment on table image_generation_jobs is 'Canonical paid image generation job and audit history.';
comment on column image_generation_jobs.brand_context_snapshot is 'Allowlisted Brand Brain fields used for this generation; no provider secrets.';
comment on column image_generation_candidates.critique is 'Advisory automated preflight and human-review state; never objective certainty.';
