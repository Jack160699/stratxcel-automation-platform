-- Additive uniqueness for Social Copilot variant generation identity.
-- Enforces one canonical variant per (master, platform, generationKey).
-- DO NOT apply to production from this coding task.

-- Expression unique index on creative_spec->>'generationKey' within master+platform.
-- Partial: only when generationKey is present.
create unique index if not exists content_variants_generation_key_uidx
  on public.content_variants (
    master_id,
    platform,
    ((creative_spec->>'generationKey'))
  )
  where (creative_spec ? 'generationKey')
    and nullif(creative_spec->>'generationKey', '') is not null;
