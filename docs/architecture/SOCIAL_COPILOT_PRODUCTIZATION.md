/**
 * Social Copilot productization — Workforce execution path.
 *
 * Owner flow (manual):
 * USER REQUEST
 * → safe preparation (automatic for plan/prepare intents)
 * → ONE canonical review artifact (persisted)
 * → Trust / Brand Brain hard gate
 * → owner CHECK → EDIT IF NEEDED → APPROVE
 * → Workforce capability runtime
 * → existing Social publish executor
 * → receipt / Shadow-truthful outcome
 *
 * Natural language never authorizes external publish.
 */

## Intent → execution

Deterministic intents in `lib/social/agent/copilot-intents.ts`:

| Intent | Behavior |
|--------|----------|
| PREPARE_WEEK_PLAN | Auto-prepare drafts; every schedule item gets concrete `scheduledAt` from week planner |
| PREPARE_CONTENT | Auto-prepare drafts; no intermediate confirmation |
| SHOW_VARIANTS / SHOW_CURRENT_REVIEW | Load persisted review; **no AI call** |
| NATURAL_AFFIRMATION (`yes` / `haan` / `push it` …) | Resurface review; never regenerate; never publish |
| REVISE_CURRENT_ARTIFACT | New revision; supersede prior PROPOSED set |
| POST_NOW_REQUEST | Prepare / propose; omit `scheduledAt` means now |
| FUTURE_SCHEDULE_REQUEST | Requires concrete future datetime |

## Week planning

`lib/social/workforce/week-planner.ts` resolves “this week” in the tenant timezone
(default Asia/Kolkata), never schedules the past, spreads slots using
`DEFAULT_WEEKLY_SLOT_POLICY`, and records:

- `scheduledAt` UTC
- timezone
- wall-clock label
- schedule source: USER_SPECIFIED | TENANT_PREFERENCE | PACKAGE_PLAN | SYSTEM_DEFAULT

Weekly `schedule_post` proposals without a valid future `scheduledAt` are rejected.

## Canonical review artifact

`SocialCopilotReviewArtifact` (`lib/social/agent/review-artifact.ts`) is assembled
from persisted variants + PROPOSED actions. Model prose is never the source of
truth for platforms, captions, media, or schedule times.

## Idempotency

`buildVariantGenerationKey` + `createContentVariant({ generationKey })` reuse an
existing row for the same tenant/mission/session/slot/master/platform/format/brief/revision.

## Supersession

Before a replacement review becomes active, scoped prior PROPOSED publish actions
become `SUPERSEDED` (history retained). `claim_social_agent_action` / fallback only
claim `PROPOSED` — superseded rows cannot execute.

## Media identity

- `attachmentId` — Copilot upload identity
- `mediaAssetId` — canonical `social_media_assets` identity

Runtime helpers reject cross-slot misuse. Resolution order:
1. explicitly selected media
2. current message / current mission attachments
3. no old-session fallback

## Image generation

`generate_image` tool → Creative Studio `media.image_generation` provider.
If no provider: `NOT_CONFIGURED` / setup UI — **no fake assets**.
Test provider may inject candidates; selection required before READY.

## Brand Brain / Trust

Hard gate (`trust-hard-gate.ts`) before READY FOR APPROVAL / Approve:

- blocked phrases (normalized: case, hyphen, whitespace, punctuation)
- forbidden claims
- unsupported marketing claims
- Stratxcel capability claims checked against runtime evidence (Shadow / dry-run / capabilities)

Approval cannot bypass Trust, Shadow, version binding, or capability blocks.

## PREVIEW = APPROVAL = PUBLISH

Exact artifact version / fingerprint must match across preview, approval, and publish.
Edits create a new revision and invalidate prior approval.

## RPC reconciliation

Additive migration `20260812110000_reconcile_social_agent_action_claim.sql`
CREATE OR REPLACE hardened `claim_social_agent_action` without editing old migrations
or inserting fake migration-history rows. Application fallback remains for PGRST202.

`20260812110100_social_agent_action_review_supersession.sql` adds SUPERSEDED status
and review JSON indexes.

**Neither migration is applied to production by this coding task.**

## Package Autopilot

Unchanged standing authorization: Starter / Growth / Business / Image30 consume the
Business Growth Plan Social subplan. Manual Copilot chat cannot acquire package
AUTO_PUBLISH. Package weekly slots also require concrete timestamps.

For the real, current per-item generation pipeline (research → strategy →
creative brief → treatment → copy → quality gate → image → logo → publish)
and the Hermes campaign-task ledger that observes it, see
`PACKAGE_AUTOPILOT_AND_HERMES.md` — this section predates the v3 plan
catalog and the Hermes instrumentation layer.

## Wiring

```
legacy Copilot UI / server action
  → orchestrator (intents + review)
  → Workforce helpers (week planner, auth, trust, artifact resolution)
  → Creative Studio (image capability)
  → Trust Department (claim guard / release readiness)
  → existing Social executor / worker / Shadow / receipts
```
