-- Fix Main Content UI / Force Publish mission: real gap found live, deeper
-- than an image-resolution bug -- a real customer session (magic-link
-- login, not service role) got "No content found" on the ENTIRE /app/content
-- page, including plain-text captions that need no storage/signed-URL
-- resolution at all.
--
-- Root cause: content_master/content_variants carry a DB-enforced XOR
-- constraint -- (owner_id IS NOT NULL) <> (tenant_id IS NOT NULL), added in
-- 20260818230000_social_copilot_tenant_scoping.sql. Package Autopilot's
-- content-creation call (lib/social/package-autopilot.ts's
-- prepareNearTermPackageItems) built an OwnerContext (writes owner_id
-- only) instead of a real tenant-scoped AgentTenantContext. An owner_id-
-- scoped content_master row is only ever RLS-visible to a real StratXcel
-- staff member (content_master_admin_owner requires stratxcel_admins
-- membership) -- a real paying customer viewing their OWN tenant's
-- package-autopilot content could never see it via
-- content_master_tenant_member, which requires tenant_id IS NOT NULL.
-- Confirmed live: 27 of 28 real content_master rows system-wide had
-- owner_id set and tenant_id null. Fixed at the source in
-- package-autopilot.ts (this migration only repairs already-existing rows).
--
-- Re-scopes owner_id -> tenant_id (satisfying the existing XOR constraint
-- exactly, since owner_id is cleared in the same UPDATE) for every row
-- whose owner_id maps unambiguously to a real tenant via its bound
-- social_brand_profiles row. Confirmed live before writing this: no
-- owner_id maps to more than one distinct tenant_id. Rows with no
-- resolvable tenant (6 of 27, real orphaned/test data with no matching
-- brand profile) are deliberately left untouched rather than guessed.
update content_master m
set tenant_id = sbp.tenant_id,
    owner_id = null,
    updated_at = now()
from (
  select distinct on (owner_id) owner_id, tenant_id
  from social_brand_profiles
  where tenant_id is not null
  order by owner_id, tenant_id
) sbp
where m.owner_id = sbp.owner_id
  and m.tenant_id is null;
