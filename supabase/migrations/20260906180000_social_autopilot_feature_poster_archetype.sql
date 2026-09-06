-- Image Quality + Marketing Creative Certification mission (2026-09-06):
-- widens the visual-archetype CHECK constraint to allow the new 13th
-- archetype, FEATURE_POSTER (lib/social/archetype-registry.ts) -- the
-- same "widen when a Nth archetype ships" pattern already used by
-- 20260828040000_social_autopilot_visual_archetype_preferences.sql
-- (which created this exact constraint for the original 12).
alter table social_autopilot_visual_preferences
  drop constraint if exists social_autopilot_visual_preferences_valid_archetypes;

alter table social_autopilot_visual_preferences
  add constraint social_autopilot_visual_preferences_valid_archetypes check (
    preferred_archetypes <@ array[
      'BASIC_ESSENTIAL', 'SPLIT_BANNER', 'FLOATING_CARD', 'EDITORIAL_FRAME',
      'MINIMAL_FOOTER_STRIP', 'ELEVATED_BADGE', 'DUAL_TONE_SIDEBAR', 'FROSTED_GLASS_CENTER',
      'TYPOGRAPHIC_HERO', 'POLAROID_LIFESTYLE', 'CLINICAL_TRUST', 'NEON_NIGHTLIFE',
      'FEATURE_POSTER'
    ]::text[]
  );
