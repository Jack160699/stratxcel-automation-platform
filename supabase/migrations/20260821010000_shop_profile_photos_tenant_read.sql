-- Shop Profile photo gallery — multi-member tenant visibility.
--
-- The customer app's Shop Profile screen (app/app/brand/page.tsx,
-- app/api/platform/brand/photos/route.ts) lets any tenant member upload
-- photos of the shop/products into the existing social_media_assets table
-- (packages already established by supabase/migrations/20260729094500_media_ingestion.sql
-- and 20260811020000_social_package_autopilot_brand_media_binding.sql),
-- tagged via provenance->>'purpose' = 'shop_profile_photo' rather than a
-- new source_type value (social_media_assets.source_type has a CHECK
-- constraint restricted to 'upload' | 'attachment' | 'generated' —
-- provenance jsonb has no such constraint, so it's the safe place to add a
-- new distinguishing tag without altering that constraint).
--
-- The existing social_media_assets_owner policy (for all, using
-- owner_id = auth.uid()) already lets the uploading user insert/read/
-- delete their own shop photos with zero migration — this policy is purely
-- additive, extending read+insert+delete to every other member of the same
-- tenant, mirroring the shape of social_media_assets_tenant_generated_read
-- (20260812104243_image_generation_v1.sql) for the 'generated' source_type.
-- RLS policies are OR'd together, so this can only add access, never
-- narrow what social_media_assets_owner already permits.
create policy social_media_assets_tenant_shop_profile on social_media_assets for all
  to authenticated
  using (
    tenant_id is not null
    and source_type = 'upload'
    and (provenance ->> 'purpose') = 'shop_profile_photo'
    and exists (
      select 1 from tenant_members m
      where m.tenant_id = social_media_assets.tenant_id
        and m.user_id = (select auth.uid())
    )
  )
  with check (
    tenant_id is not null
    and source_type = 'upload'
    and (provenance ->> 'purpose') = 'shop_profile_photo'
    and exists (
      select 1 from tenant_members m
      where m.tenant_id = social_media_assets.tenant_id
        and m.user_id = (select auth.uid())
    )
  );
