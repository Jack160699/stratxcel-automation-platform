# Package Autopilot & Hermes Campaign Ledger

The real, current architecture of StratXcel's autonomous Social Autopilot
pipeline, and how the Hermes campaign-task ledger observes it. Supersedes
`SOCIAL_COPILOT_PRODUCTIZATION.md`'s thin "Package Autopilot" section (which
still refers to the legacy Starter/Growth/Business tiers) for anything about
the real automated package-content engine specifically.

## One pipeline, not two

There is exactly one real content-generation engine for autonomous
(non-chat) social content: `prepareNearTermPackageItems` in
`lib/social/package-autopilot.ts`. Hermes does not run a second,
independent generation path — it instruments this one.

```
attemptAutoActivatePackageAutopilot   (Razorpay webhook / OAuth callback)
        ↓
activatePackageAutopilot              (real prerequisite checks: active
                                        subscription, social_autopilot
                                        capability, ≥1 CONNECTED platform)
        ↓
planPackagePeriod                     (schedules empty slots for the
                                        whole service period — cheap,
                                        idempotent, no AI calls)
        ↓
prepareNearTermPackageItems           (the real generation engine, called
                                        repeatedly — cron + self-chaining —
                                        for whatever is due within
                                        preparation_horizon_days)
        ↓
executeAuthorizedPackagePost          (real publish, claimed atomically)
```

**A tenant with no connected social platform cannot activate Package
Autopilot at all** — `activatePackageAutopilot` fails closed with
`prerequisite_missing: connect ... for this workspace before activating`.
This is a deliberate product safety boundary, not a gap: content can still
be created for such a tenant via Creative Studio (`/app/content/studio`,
no connected account required); it simply cannot be scheduled/published
until a real account is connected.

## Per-item real stage sequence

Inside one `prepareNearTermPackageItems` pass, each due queue item goes
through, in order:

1. **Brand read** — `getBoundBrandProfile` (Brand Brain: identity, voice,
   pillars, audiences).
2. **Strategy** — `deriveBusinessContentIntelligence` +
   `buildCampaignStrategy` (the 28-day planner), indexed by the item's
   `package_sequence` to pick that day's planned objective/pillar.
3. **Creative brief** — `buildCreativeBrief`, grounded in verified business
   facts (`buildVerifiedBusinessInformation`, gathered once per batch, never
   per item), with diversity exclusions from this authorization's own
   recent history.
4. **Creative treatment** — `buildCreativeTreatmentPrompt` (visual concept,
   composition, layout archetype — server-authoritative via
   `resolveAutomatedRouting`/`forceArchetypeOntoTreatment`, never trusted
   purely from the model's own output).
5. **Copy generation + quality gate** — `runGenerationLoop` →
   `scoreGeneratedContent` (`lib/social/quality-score.ts`): hard-fail gates
   for business-identity/target-audience contamination
   (`checkTargetIndustryContamination`), duplicate concepts, weak CTAs,
   fabricated personas, generic template language, and more. A failure here
   triggers a staged, failure-specific retry (Mission F's recovery policy,
   `MAX_RECOVERY_ATTEMPTS = 4`), never a blind identical re-roll.
6. **Visual generation** — `generateNetNewPackageMediaAsset` (NET_NEW_AI
   creative mode) or `selectPackageMediaAsset` (BRAND_LIBRARY mode, filtered
   to `autopilot_eligible = true` assets only — see the asset-classification
   note below). NET_NEW_AI never falls back to an old asset on failure; it
   throws, and the item is marked `BLOCKED` with a real reason.
7. **Logo compositing** — the real logo is stamped onto the generated image
   pixel-exact by `lib/image-generation/service.ts` via
   `resolveLogoVariantBundle`/`resolveLegacyLogoImage` — the model never
   draws the logo itself.
8. **Persist + schedule** — `createContentMaster`/`createContentVariant`,
   tenant-scoped (never owner-scoped — see Mission "Production Repair"'s
   RLS-visibility fix), status set to `PREPARED` or `REVIEW_REQUIRED`
   depending on `publishing_mode`.

A transient provider failure (`PROVIDER_RATE_LIMIT`, `STORAGE_UNAVAILABLE`)
is distinguished from a genuine content-quality rejection via
`image-generation/service.ts`'s `safeProviderReason()` and the
`NetNewGenerationError.retryable` flag threaded through the throw
boundary — it never consumes the bounded recovery-attempt budget.

## Hermes campaign-task ledger (additive instrumentation)

`social_autopilot_campaign_tasks` (migration `20260830070000`) + the real
write path `recordCampaignTask()` (`lib/hermes/social-autopilot-campaign.ts`)
make the 14 real specialist-role stages above individually observable,
without replacing any of the logic that produces them:

| Specialist role | Real implementation it observes |
|---|---|
| `research`, `fact_claim_safety` | `buildVerifiedBusinessInformation` (once/batch) |
| `brand_intelligence` | `getBoundBrandProfile` |
| `customer_psychology` | `buildCustomerPsychologyProfile` (new, real — structures `brandProfile.audiences[].pain_points`) |
| `market_trend_intelligence` | `researchInsightsForIndustry` / `seasonalContextLine` |
| `strategy_director` | `buildCampaignStrategy` |
| `creative_brief` | `buildCreativeBrief` |
| `creative_director` | `buildCreativeTreatmentPrompt` |
| `copywriter` | the generation-loop copy call |
| `visual_generation`, `brand_logo_guardian` | `generateNetNewPackageMediaAsset` / the real logo compositor |
| `diversity_editor`, `final_quality_director` | `scoreGeneratedContent` (the same hard-fail reason codes cover both) |
| `publishing_scheduling` | `executeAuthorizedPackagePost` |

Each item's write records `agent_role`, `status` (`STARTED`/`COMPLETED`/
`FAILED`), `attempt`, `input_ref`/`output`/`quality` (jsonb), and
`failure_reason` — attributed via a `currentStage` tracker so a failure
inside the per-item `try/catch` is recorded against the real stage that
threw, not a generic "preparation failed". `recordCampaignTask` never
throws and never blocks real generation (same discipline as `recordAudit`).

RLS: `authenticated`-scoped staff read only
(`social_autopilot_campaign_tasks_staff_read`, verified against the real
live `social_autopilot_producer_runs_staff_read` policy before writing it,
not assumed by analogy). Service-role writes bypass RLS by Supabase's own
default — no explicit write policy needed.

## What this is NOT

- **Not 12 independent agent runtime processes.** Running 112 posts × 12+
  literal parallel Claude/agent sessions per post was evaluated and
  rejected as infeasible and unnecessary for a live revenue system — the 14
  roles are real, individually-observable *stages* of the one proven
  pipeline, not independent orchestration units.
- **Not a weekly (Monday–Sunday) rearchitecture.** The pipeline already
  only generates within a rolling `preparation_horizon_days` near-term
  window (never the whole period at once), and a genuinely new customer
  joining mid-period is already handled correctly by
  `computePackageDistribution`. What is genuinely missing — a real,
  performance-feedback-driven weekly re-strategizing loop (last week's real
  engagement data feeding this week's strategy) — was evaluated and
  deliberately deferred: it requires real analytics ingestion from each
  connected platform's API, which is a separate, substantial feature, not
  something safely retrofit into a live revenue pipeline in the same pass
  as everything else in this document.

## Related fixes (same investigation, different systems)

Two severe, real defects were found and fixed while restructuring this
area — both are payments/entitlements, not part of the pipeline above, but
were surfaced by the same "trust nothing, verify against the live system"
methodology:

- `reconcile_and_fulfill_razorpay_payment_v4` /
  `reconcile_and_fulfill_razorpay_subscription_charge` only recognized the
  legacy v2 plan tiers — a real customer paying for any current
  self-service plan would have had their payment captured but never
  received an active subscription. Fixed in migration `20260830090000`.
- The GoFree subscription-code redemption path had the same gap. Fixed in
  migration `20260830080000`.

See `AUDIT_MONTHLY_ALLOWANCE.md` for the real 5/month audit-allowance
feature built in the same pass.
