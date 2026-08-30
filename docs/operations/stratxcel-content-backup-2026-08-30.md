# StratXcel real content backup — 2026-08-30

Pre-cleanup backup/export of the real StratXcel tenant's Social Autopilot
content, taken per the mission brief's Section 5 requirement to record IDs
and metadata **before** any deletion/archival decision is executed. Full
row data: `stratxcel-content-backup-2026-08-30.json` (54 rows, sourced
directly from a live `db query --linked` join across
`social_autopilot_queue_items` / `content_master` / `content_variants`,
scoped to the real tenant `466e6195-a9f6-4576-8271-29fdae61c18a` and its
one real authorization `664d61e3-44e7-4fb8-abb4-af3e576a4424`).

**No deletion has been performed.** This is a read-only export.

## Real counts

| status | count |
|---|---|
| PUBLISHED | 4 |
| PREPARED (READY variant, not yet published) | 8 |
| BLOCKED | 42 |

## What the 42 BLOCKED items actually are (verified from real `last_error` values, not assumed)

- **1 item genuinely quota-blocked**: `last_error` reads *"recovery
  exhausted after 4 structurally different attempts -- last failure: This
  workspace has used all of its included generations for this month."*
  This is real, live confirmation that `automated_content_monthly`
  exhaustion is an actual hard gate in the generation pipeline, not just a
  billing-page display value.
- **~20 items failed on a real, sustained upstream provider outage**:
  `last_error` reads *"generation call failed on attempt 1/2 (or 2/2): AI
  service temporarily unavailable"* — consistent with the
  previously-documented Gemini/OpenAI `PROVIDER_RATE_LIMIT` saga earlier
  in this engagement. Concentrated in items whose `queue_item_updated_at`
  is 2026-08-30 (today), i.e. still an active, recent condition.
- **~21 items failed the real quality gate**: `last_error` values like
  *"score 85/86/87/88/89 below threshold"*, `DUPLICATE_CONCEPT`,
  `WEAK_CTA` — genuine content-quality rejections from
  `scoreGeneratedContent`, correctly exhausting the real 4-attempt
  staged-recovery budget rather than publishing weak content.

No BLOCKED item's `last_error` indicates business-identity or
target-audience contamination (the clinic/dental/salon/restaurant pattern
fixed earlier this engagement) — that class of failure is not present in
this real batch.

## Why there are 54 slot rows against a 28-post period target

`social_autopilot_authorizations.period_target_units = 28`, yet there are
54 real queue-item rows spanning scheduled dates through 2026-09-11. This
is expected, not a bug: `planPackagePeriod` pre-plans empty slots for the
*whole* service period upfront (cheap, idempotent, no AI calls — see
`docs/architecture/PACKAGE_AUTOPILOT_AND_HERMES.md`), and only
`prepareNearTermPackageItems`, gated by the real entitlement, actually
generates content into a subset of them. More slots exist than the
entitlement will ever fill in one period; the rest are designed to stay
`BLOCKED`/unfilled until quota resets or the period ends.

## Content-quality spot check (the 4 PUBLISHED + 8 PREPARED rows with real captions)

All 12 real captions are on-brand for StratXcel itself (a Bhilai,
Chhattisgarh-based marketing-automation company), correctly describe
StratXcel's own Social Autopilot / SEO product, and consistently name
Bhilai as the real location. Two captions use an illustrative third-party
customer example ("a busy neighborhood clinic in Bhilai," "Dr. Sharma")
framed correctly as *a customer StratXcel serves*, not as StratXcel's own
identity — this is the corrected framing from the target-industry-
contamination fix earlier in this engagement (commit `3780ef2`), not a
recurrence of it.

## Open decision this backup unblocks

The mission brief (Section 5 onward) calls for archiving/removing existing
generated content and regenerating a fresh TODAY→SUNDAY batch. Given that:

- 4 of these 54 items are already `PUBLISHED` to StratXcel's real,
  connected Facebook/Threads pages — a DB-level delete would not and
  cannot un-publish them from the live platform; it would only remove the
  local record of a real, already-public post.
- The remaining 50 items reflect ~29 real calendar days already planned
  under the existing monthly-period model (not a weekly model) — full
  cleanup would discard real, mostly quality-gate-legitimate work product
  scheduled through 2026-09-11, on a live paying customer's account.

this decision was deliberately not executed unilaterally in the same pass
as this export. See the session's final report for how it was resolved.
