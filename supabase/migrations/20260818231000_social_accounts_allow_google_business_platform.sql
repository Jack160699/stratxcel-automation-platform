-- social_accounts_platform_check never included 'google_business', so every
-- attempt to persist a Google Business Profile connection (the OAuth
-- callback's upsertConnectedAccount call in app/api/social/oauth/[provider]/
-- callback/route.ts, and the onboarding-metadata reconciliation path in
-- lib/social/provisioning.ts) has always failed its CHECK constraint. The
-- callback catches this non-fatally and still redirects with
-- oauth=success, so the failure was invisible to the customer -- the row
-- simply never gets created, and the canonical resolver
-- (lib/connectors/canonical-status.ts's getTenantDigitalPresence) can
-- never find it, so Google Business Profile always shows NOT_CONNECTED /
-- DISCOVERED_PUBLICLY regardless of a successful OAuth grant.
--
-- Purely additive: widens the allowed set, touches no existing row,
-- changes no other constraint.

alter table social_accounts drop constraint social_accounts_platform_check;
alter table social_accounts add constraint social_accounts_platform_check
  check (platform = any (array['instagram','facebook','threads','linkedin','youtube','x','tiktok','pinterest','google_business']));

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when others then
    null;
end $$;
