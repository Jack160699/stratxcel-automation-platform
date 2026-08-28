-- Fix Main Content UI / Force Publish mission: real gap found live.
--
-- social_agent_attachment_objects_select (storage.objects RLS) only ever
-- allows a read when the OBJECT's own `owner_id` metadata column equals
-- auth.uid(). That column is populated automatically by Supabase Storage
-- when an object is uploaded through an authenticated (non-service-role)
-- client -- but every Creative Studio / package-autopilot AI-generated
-- image is uploaded via the service-role client, which never sets it.
-- Confirmed live: all 8 real gpt-image-2 assets for the Stratxcel tenant
-- have storage.objects.owner_id = NULL, so createSignedUrl for any of them
-- fails RLS for the real customer's own session (confirmed via a live
-- authenticated test: StorageApiError, "signature verification failed" /
-- policy denial) even though the owning social_media_assets row is fully
-- visible and correctly tenant-scoped. The Content Library's try/catch
-- around createSignedUrl silently drops the item, which is why the
-- Creatives & Posters tab (and any card needing this bucket's image)
-- rendered "No content found" despite the data genuinely existing.
--
-- Adds a second, additive SELECT policy on the same bucket: readable when
-- the object's storage_path matches a social_media_assets row the caller
-- can already see via ITS OWN existing table-level RLS (owner match or
-- tenant membership -- exactly mirroring social_media_assets_owner /
-- social_media_assets_tenant_member). Does not touch INSERT/UPDATE/DELETE
-- or the existing owner_id-based SELECT policy -- purely additive.
create policy social_agent_attachment_objects_asset_read
on storage.objects for select
using (
  bucket_id = 'social-agent-attachments'
  and exists (
    select 1
    from social_media_assets a
    where a.storage_bucket = storage.objects.bucket_id
      and a.storage_path = storage.objects.name
      and (
        a.owner_id = (select auth.uid())
        or (
          a.tenant_id is not null
          and exists (
            select 1 from tenant_members tm
            where tm.tenant_id = a.tenant_id
              and tm.user_id = (select auth.uid())
          )
        )
      )
  )
);
