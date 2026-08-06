DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'social_verification_publish_authorizations'
  ) THEN
    ALTER TABLE social_verification_publish_authorizations
      ADD COLUMN IF NOT EXISTS privacy_status text;

    UPDATE social_verification_publish_authorizations
      SET privacy_status = 'private'
      WHERE privacy_status IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'social_verification_publish_authorizations_privacy_check'
        AND conrelid = 'public.social_verification_publish_authorizations'::regclass
    ) THEN
      ALTER TABLE public.social_verification_publish_authorizations
        ADD CONSTRAINT social_verification_publish_authorizations_privacy_check
        CHECK (privacy_status IN ('private', 'unlisted'));
    END IF;

    ALTER TABLE social_verification_publish_authorizations
      ALTER COLUMN privacy_status SET NOT NULL;

    DROP POLICY IF EXISTS social_verification_publish_authorizations_owner_insert
    ON social_verification_publish_authorizations;

    CREATE POLICY social_verification_publish_authorizations_owner_insert
      ON social_verification_publish_authorizations
      FOR INSERT
      TO authenticated
      WITH CHECK (
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
            and coalesce(v.creative_spec->>'youtube_privacy_status', 'private') IN ('private', 'unlisted')
            and coalesce(v.creative_spec->>'youtube_privacy_status', 'private') = social_verification_publish_authorizations.privacy_status
        )
        and exists (
          select 1 from social_media_assets ma
          where ma.id = social_verification_publish_authorizations.asset_id
            and ma.owner_id = (select auth.uid())
            and ma.status = 'READY'
            and ma.mime_type = 'video/mp4'
        )
      );
  END IF;
END $$;

