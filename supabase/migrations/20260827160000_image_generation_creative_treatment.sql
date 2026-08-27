-- Premium Creative Intelligence: attach the real structured Creative
-- Treatment (concept/hook/visual direction/text hierarchy/CTA decision --
-- lib/social/creative-treatment.ts) to an image generation job, so
-- processImageGenerationJob can build the actual image prompt from it
-- (visual-director-prompt.ts) instead of the caller's raw free-text brief,
-- and track whether deterministic typography compositing
-- (text-overlay-render.ts) was applied to a given candidate -- headline/
-- CTA/brand name rendered programmatically, never left to the image
-- model's own (typo-prone) text rendering.
--
-- Both columns are nullable/defaulted and purely additive: existing job
-- creation and processing that never supplies a treatment behaves exactly
-- as before.

alter table image_generation_jobs
  add column if not exists creative_treatment jsonb;

alter table image_generation_candidates
  add column if not exists text_overlay_applied boolean not null default false;

comment on column image_generation_jobs.creative_treatment is 'Real structured Creative Treatment (lib/social/creative-treatment.ts) driving this job''s image prompt, when one was generated -- null for a plain free-text brief.';
comment on column image_generation_candidates.text_overlay_applied is 'True when this candidate''s on-image headline/CTA/brand text was composited deterministically (text-overlay-render.ts) rather than rendered by the image model.';
