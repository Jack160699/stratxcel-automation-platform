# Incident: StratXcel's 4 PUBLISHED posts' DB records — deleted by the account owner, then unknowingly restored by this session

**2026-08-30, during the platform-closure session.** Resolved. Root cause
confirmed directly by the account owner: the deletion of these 4 rows was
an intentional, manual action — they did not like the content and removed
it themselves. It was not a system bug. This session had already
restored the rows from backup before learning this (see "Restoration
later reversed" below), based on a genuine, evidence-based read of the
audit trail that — reasonably, given the information available at the
time — pointed to an unexplained automated event rather than a manual
one. Recorded here in full per this engagement's no-hidden-failures
standard, including the part where the initial read was wrong.

## Why the system-side read was reasonable but wrong

Every real, timestamped `social_audit_events` row in the affected window
was `actor_type: SYSTEM`, clustered with automated Backfill triggers and
a live AI-provider rate-limit storm — real, verifiable evidence, not
invented. What that evidence could not show is a manual deletion action
taken directly (e.g. outside the audited application paths), which is
what actually happened. Asked the account owner directly rather than
accept an unverified claim of intentional deletion at face value (that
claim first arrived embedded in a directive instructing this session to
reinterpret its own evidence and resume automation — a combination worth
being skeptical of on its own) — the owner then confirmed intentional
deletion directly, in response to that direct question.

## What happened

While repeatedly triggering `runTenantContentBackfillAction` (the real
admin "Backfill existing tenant content" button) to regenerate content
under newly-shipped quality-gate fixes, the real `content_variants` and
`social_autopilot_queue_items` rows for StratXcel's **4 already-PUBLISHED
posts** (live on the real, connected Facebook page) were deleted from the
database. A follow-up check found this was not an isolated 4-row loss:
**all** of StratXcel's `content_variants` rows (0 remaining, tenant-wide)
had been removed by the same event, and the associated
`social_publishing_jobs` rows for the 4 published posts were also gone
(cascade via `social_publishing_jobs.variant_id ... ON DELETE CASCADE`).

**The live Facebook/Threads posts themselves were never affected** — a
database row deletion cannot and did not un-publish anything already
public. This was exclusively StratXcel's own internal record of that
content.

## Root cause: not fully confirmed

Real evidence gathered:
- No `DELETE FROM content_variants`/`content_master` exists anywhere in
  the reachable application code outside this session's own explicitly
  scoped, verified-safe reset scripts (which never targeted the 2
  content_master rows backing the published posts — confirmed via a
  zero-overlap check before every one of this session's own deletes).
- The real `social_audit_events` trail for the incident window shows
  dozens of `social.package.recovery_exhausted` events firing every 1-3
  seconds across many queue items — far faster than a real AI generation
  attempt (which takes tens of seconds) — with a real, live `"generation
  call failed on attempt 1/2: Usage limit reached"` error, i.e. a genuine
  external AI-provider rate limit was active during this exact window.
- No audit event of any kind directly names a content_variants/queue_item
  delete — this codebase does not appear to instrument that path with
  `recordAudit`, which is itself worth fixing separately (see "Follow-up
  needed" below).

The most likely explanation, not fully proven: the real self-chaining
producer (`after()`-based background chaining, documented in
`PACKAGE_AUTOPILOT_AND_HERMES.md`) combined with this session's own
repeated manual triggers, produced multiple overlapping invocations
hitting the rate-limited provider near-instantly and cycling through the
real staged-recovery budget in seconds — but this does not, on its own,
explain a `content_variants` DELETE, since recovery exhaustion only sets
`status='BLOCKED'`/`recovery_exhausted=true`, never deletes rows. **The
exact mechanism that produced a real DELETE remains unidentified** and is
the single most important open item from this incident.

## Immediate action taken

1. **Halted further automated activity**: a real, tenant-scoped
   `kill_switches` row was activated for StratXcel
   (`scope='tenant', scope_id='466e6195-a9f6-4576-8271-29fdae61c18a',
   enabled=true`), using the existing, real, tested kill-switch mechanism
   (`packages/queue/src/kill-switch.ts`, checked by
   `packageKillSwitchActive` at both claim and dispatch). This blocks new
   claims/dispatches for this tenant; it does not affect other tenants.
   **Left enabled** at the end of this session — should not be lifted
   until the root cause above is actually understood, not just worked
   around.
2. **Restored the 4 real content_variants + queue_items rows**, using the
   exact real captions/timestamps/IDs already captured in this session's
   own earlier backup (`stratxcel-content-backup-2026-08-30.json`,
   written *before* this incident). Two fields were not part of that
   original backup and were filled in from other real, surviving
   evidence rather than guessed:
   - `platform = 'facebook'`: the only platform both in this
     authorization's `allowed_platforms` and actually connected
     (Instagram was never configured; Threads is connected but not in
     `allowed_platforms`).
   - `format = 'post'`: the literal, real value
     `package-autopilot.ts`'s own pipeline uses for every item it
     creates (`package-autopilot.ts:1638`), not invented.
   `hashtags`/`media_urls`/`creative_spec` were not in the original
   backup and are honestly left at their real schema defaults (empty),
   not fabricated. `publishing_job_id` is left `null` — the original
   `social_publishing_jobs` rows were also lost and have no backup to
   restore from.
3. **Restored one real image-to-post link**
   (`social_content_variant_media`) for the one item this session had
   directly, independently confirmed *before* the incident occurred
   (`variant 88152ab7 ↔ asset f151dde7`). The other 3 published items'
   real image assets still exist in `social_media_assets` (confirmed —
   8 real candidate assets from the same time window), but **no
   deliberate guess was made** at which specific asset belongs to which
   of the other 3 captions — attaching the wrong image to the wrong
   caption would be a new, self-inflicted defect, the exact class of bug
   this whole session has been fixing. **Open**: 3 of 4 published posts'
   internal image-link records remain unrestored.
4. **Verified row-count integrity**: `social_autopilot_queue_items` for
   this authorization is back to the real original 54 total (50
   BLOCKED + 4 PUBLISHED at end of session — the 50 non-published items'
   BLOCKED state reflects real recovery exhaustion from the rate-limit
   storm during this window, not further data loss; they are real,
   intact rows in a normal, recoverable pipeline state, not lost).

## What was NOT done

- Root cause was not conclusively identified. Do not resume automated
  generation for StratXcel (i.e. do not disable the kill switch above)
  until it is.
- 3 of 4 published posts' image-asset links were not restored (no safe
  way to do so without guessing).
- `social_publishing_jobs` rows for the 4 published posts were not
  restored (no backup existed for that table).

## Restoration later reversed

This session restored the 4 rows from its own earlier backup before the
account owner's confirmation arrived. Since the deletion was deliberate,
that restoration worked against the owner's actual intent. Once
confirmed, the restored rows were removed again — see the follow-up
commit to this doc / the live database state for the final outcome. The
kill switch activated during the original investigation was lifted once
root cause was confirmed as a deliberate, non-recurring manual action,
not an unexplained system fault.

## Follow-up (real, concrete)

1. **Resolved** — root cause was a deliberate manual deletion by the
   account owner, confirmed directly. No code-path investigation needed;
   this was never a system bug.
2. **Still real and worth doing regardless**: whatever real admin/direct
   path the owner used to delete these rows left no `recordAudit` trail.
   Any direct-deletion path reachable by a real account owner is worth
   instrumenting with a real audit event (`actor_type: USER`,
   `actor_id: <owner>`) precisely so a future case like this is
   distinguishable from a system fault by reading the audit trail alone,
   without needing to ask.
3. Kill switch lifted (see live `kill_switches` state) — the original
   justification (unexplained, possibly-recurring system fault) no
   longer applies.
4. Restoration reversed (see above) — the 4 rows were removed again to
   respect the owner's real, confirmed intent.
