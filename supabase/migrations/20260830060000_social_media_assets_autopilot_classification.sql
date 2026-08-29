-- STRATXCEL FINAL REMAINING BLOCKERS mission: social_media_assets has no
-- classification whatsoever today -- selectPackageMediaAsset (the
-- BRAND_LIBRARY selector) filters ONLY by tenant_id/owner_id/mime_type
-- prefix, meaning a manually-designed marketing poster (Creative Studio's
-- "Create Poster" tool, source_context='creative_studio'), or even a raw
-- 64x64 logo-mark PNG (purpose='logo_variant'), is currently a structurally
-- valid candidate for automatic selection as a Social Autopilot post's main
-- photo. Confirmed live: 2 of 24 recent social_autopilot-sourced generated
-- images were directly opened and inspected as raw pixels and genuinely
-- show a baked-in blue lower-third banner (a real, now-fixed pipeline
-- defect, commit c9949ed) -- these must never be reused as a future post's
-- image even though this specific tenant currently uses NET_NEW_AI (which
-- doesn't read from this table at all) rather than BRAND_LIBRARY mode.
--
-- autopilot_eligible defaults to true (never retroactively disables an
-- asset nobody has ever flagged) -- ineligibility is only ever set
-- explicitly by a real classification pass (see the same-session backfill
-- UPDATE), never inferred implicitly by this migration itself. Never
-- deletes any asset -- quarantine, not removal (Section 6/12/38).
alter table social_media_assets
  add column if not exists asset_type text,
  add column if not exists autopilot_eligible boolean not null default true,
  add column if not exists eligibility_reason text;

alter table social_media_assets drop constraint if exists social_media_assets_asset_type_check;
alter table social_media_assets add constraint social_media_assets_asset_type_check
  check (asset_type is null or asset_type in (
    'BRAND_LOGO', 'EDITORIAL_PHOTO', 'PRODUCT_PHOTO', 'SERVICE_PHOTO',
    'USER_UPLOADED_PHOTO', 'AI_GENERATED_PHOTO', 'MARKETING_GRAPHIC',
    'POSTER', 'BANNER', 'OLD_SOCIAL_CREATIVE', 'SCREENSHOT', 'DOCUMENT', 'OTHER'
  ));

comment on column social_media_assets.asset_type is
  'Real visual/functional classification -- never inferred from filename alone. NULL = not yet classified (treated as eligible by default, same as before this column existed).';
comment on column social_media_assets.autopilot_eligible is
  'Whether Social Autopilot''s automatic selector (selectPackageMediaAsset) may pick this as a post''s main photo. Defaults true -- quarantining an asset is an explicit, evidenced action, never an implicit side effect of this column existing.';
comment on column social_media_assets.eligibility_reason is
  'Human-readable reason when autopilot_eligible was explicitly set to false -- never a bare boolean with no explanation.';

-- Fast filtering for the selector's real WHERE clause.
create index if not exists social_media_assets_autopilot_eligible_idx
  on social_media_assets (tenant_id, owner_id, autopilot_eligible)
  where autopilot_eligible = true;
