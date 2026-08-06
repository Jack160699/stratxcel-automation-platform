-- Canonical private media assets for Create and Copilot. Objects remain in
-- the existing private Social Autopilot bucket; providers receive short-lived
-- signed URLs only when a publishing worker is actively processing a job.

alter table social_agent_attachments
  drop constraint if exists social_agent_attachments_size_bytes_check;
alter table social_agent_attachments
  add constraint social_agent_attachments_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 104857600);

create table social_media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_attachment_id uuid unique references social_agent_attachments(id) on delete set null,
  storage_bucket text not null default 'social-agent-attachments'
    check (storage_bucket = 'social-agent-attachments'),
  storage_path text not null unique,
  original_name text not null,
  extension text not null check (extension in ('mp4', 'jpg', 'jpeg', 'png', 'webp')),
  mime_type text not null check (mime_type in ('video/mp4', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  status text not null default 'UPLOADING' check (status in ('UPLOADING', 'READY', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table social_media_assets enable row level security;
create index social_media_assets_owner_created_idx
  on social_media_assets (owner_id, created_at desc);

create policy social_media_assets_owner
  on social_media_assets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

alter table social_agent_attachments
  add column media_asset_id uuid references social_media_assets(id) on delete set null;
create index social_agent_attachments_media_asset_idx
  on social_agent_attachments (media_asset_id);

create table social_content_master_media (
  master_id uuid not null references content_master(id) on delete cascade,
  asset_id uuid not null references social_media_assets(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (master_id, asset_id)
);

alter table social_content_master_media enable row level security;
create index social_content_master_media_asset_idx
  on social_content_master_media (asset_id);
create policy social_content_master_media_owner
  on social_content_master_media for all to authenticated
  using (
    exists (
      select 1 from content_master m
      where m.id = social_content_master_media.master_id
        and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from social_media_assets a
      where a.id = social_content_master_media.asset_id
        and a.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from content_master m
      where m.id = social_content_master_media.master_id
        and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from social_media_assets a
      where a.id = social_content_master_media.asset_id
        and a.owner_id = (select auth.uid())
        and a.status = 'READY'
    )
  );

create table social_content_variant_media (
  variant_id uuid not null references content_variants(id) on delete cascade,
  asset_id uuid not null references social_media_assets(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (variant_id, asset_id)
);

alter table social_content_variant_media enable row level security;
create index social_content_variant_media_asset_idx
  on social_content_variant_media (asset_id);
create policy social_content_variant_media_owner
  on social_content_variant_media for all to authenticated
  using (
    exists (
      select 1
      from content_variants v
      join content_master m on m.id = v.master_id
      where v.id = social_content_variant_media.variant_id
        and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from social_media_assets a
      where a.id = social_content_variant_media.asset_id
        and a.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from content_variants v
      join content_master m on m.id = v.master_id
      where v.id = social_content_variant_media.variant_id
        and m.owner_id = (select auth.uid())
    )
    and exists (
      select 1 from social_media_assets a
      where a.id = social_content_variant_media.asset_id
        and a.owner_id = (select auth.uid())
        and a.status = 'READY'
    )
  );

-- One tightly-bound authorization may release exactly one private YouTube
-- verification job while the owner's global SHADOW mode remains enabled.
create table social_verification_publish_authorizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references social_accounts(id) on delete cascade,
  variant_id uuid not null references content_variants(id) on delete cascade,
  asset_id uuid not null references social_media_assets(id) on delete cascade,
  platform text not null default 'youtube' check (platform = 'youtube'),
  purpose text not null default 'YOUTUBE_PRIVATE_VERIFICATION'
    check (purpose = 'YOUTUBE_PRIVATE_VERIFICATION'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CONSUMED', 'REVOKED', 'EXPIRED')),
  publishing_job_id uuid unique references social_publishing_jobs(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table social_verification_publish_authorizations enable row level security;
create index social_verification_publish_authorizations_owner_idx
  on social_verification_publish_authorizations (owner_id, created_at desc);
create index social_verification_publish_authorizations_account_idx
  on social_verification_publish_authorizations (account_id);
create index social_verification_publish_authorizations_variant_idx
  on social_verification_publish_authorizations (variant_id);
create index social_verification_publish_authorizations_asset_idx
  on social_verification_publish_authorizations (asset_id);
create unique index social_verification_publish_authorizations_active_scope_idx
  on social_verification_publish_authorizations (owner_id, account_id, variant_id, asset_id)
  where status = 'ACTIVE';

create policy social_verification_publish_authorizations_owner_select
  on social_verification_publish_authorizations for select to authenticated
  using (owner_id = (select auth.uid()));

create policy social_verification_publish_authorizations_owner_insert
  on social_verification_publish_authorizations for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and platform = 'youtube'
    and purpose = 'YOUTUBE_PRIVATE_VERIFICATION'
    and status = 'ACTIVE'
    and expires_at <= now() + interval '30 minutes'
    and exists (
      select 1 from social_accounts a
      where a.id = social_verification_publish_authorizations.account_id
        and a.owner_id = (select auth.uid())
        and a.platform = 'youtube'
        and a.status = 'CONNECTED'
    )
    and exists (
      select 1
      from content_variants v
      join content_master m on m.id = v.master_id
      where v.id = social_verification_publish_authorizations.variant_id
        and m.owner_id = (select auth.uid())
        and v.platform = 'youtube'
        and coalesce(v.creative_spec->>'youtube_privacy_status', 'private') = 'private'
    )
    and exists (
      select 1 from social_media_assets ma
      where ma.id = social_verification_publish_authorizations.asset_id
        and ma.owner_id = (select auth.uid())
        and ma.status = 'READY'
        and ma.mime_type = 'video/mp4'
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    update storage.buckets
    set file_size_limit = 104857600,
        allowed_mime_types = array[
          'text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/pdf',
          'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4'
        ]
    where id = 'social-agent-attachments';
  END IF;
END $$;

grant select, insert, update, delete on social_media_assets to authenticated, service_role;
grant select, insert, update, delete on social_content_master_media to authenticated, service_role;
grant select, insert, update, delete on social_content_variant_media to authenticated, service_role;
grant select, insert on social_verification_publish_authorizations to authenticated;
grant select, insert, update on social_verification_publish_authorizations to service_role;
