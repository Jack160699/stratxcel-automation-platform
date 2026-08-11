# Social Department (WorkforceCore Execution)

**Status:** Integrated with existing Social Copilot + Package Autopilot  
**Branch:** `feat/workforce-social-department`  
**Baseline:** `736b170`

## Role

Social is an **execution department**, not a second creative universe.

```
Upstream final creative (Research → Strategy → Brand → Creative → Content → Media → Quality → Compliance)
  → Social Department
      → platform adaptation
      → preview / approval / standing authorization
      → schedule
      → publish
      → receipt
      → analytics handoff
```

Canonical creative truth remains upstream. Social maps into existing
`content_masters` / `content_variants` / `social_publishing_jobs` only where
needed for backward compatibility.

## Social release artifact

Exact fields (preview = approval = publish payload):

| Field | Meaning |
|-------|---------|
| `finalCaption` | Exact caption to publish |
| `mediaAssetIds` | Exact media asset IDs |
| `platform` | Connected supported platform |
| `accountId` | Tenant-scoped connected account |
| `cta` | Call to action |
| `accessibilityText` | Alt / accessibility text |
| `hashtags` | Structured hashtags |
| `scheduleIntent` | Real timezone timestamp (`NOW` / `AT` / `PACKAGE_SLOT`) |
| `brandBrainVersion` | Brand Brain version used |
| `upstreamArtifactIds` | Parent Workforce artifact IDs |
| `qualityStatus` / `complianceStatus` | Gate outcomes |
| `payloadFingerprint` | Hash binding preview/approval/publish identity |

Module: `lib/social/workforce/release-artifact.ts`

## Manual vs package authorization

| Path | Gate |
|------|------|
| Manual one-off | Explicit UI / WhatsApp approve action only. Phrases like `yes`, `haan`, `kar do`, `go ahead`, `push it`, `post kar do` **never** publish. |
| Package `AUTO_PUBLISH` | Standing authorization scoped to package queue + subscription entitlement. |
| Package `REVIEW_BEFORE_PUBLISH` | Review required per contract. |
| Manual mission | **Does not** inherit package standing auth. |

Shadow Mode remains a hard external mutation block (`lib/social/shadow-gate.ts`).

## Publication status

Queryable statuses for Hermes / Mission Control:

`PLANNED` · `PREPARED` · `SCHEDULED` · `PUBLISHING` · `PUBLISHED` · `FAILED` · `SHADOW_COMPLETED` · `CANCELLED`

Hermes `query_publication_status` reads tenant-scoped Social jobs/queue via
`lookupSocialPublicationStatus` — never returns provider credentials.

## Receipts & usage

Canonical receipt: tenant, mission, artifact, platform, account, provider publish ID,
publishedAt, live URL, schedule job, usage accounting ref, error/shadow state.

Usage follows existing counting policy (`CONTENT_UNIT` vs `PLATFORM_PUBLISH`) with
idempotent settle keys. Technical publish retries must not regenerate creative.

## Package plan integration

Business Growth Plan `socialPlan` feeds Package Autopilot unit execution.
Purchased composition is preserved; Strategy decides unit purpose; Social executes.

Workflow stages added after quality for `social_package` / `mixed_package`:

`s_compliance` → `s_social_adapt` → `s_social_schedule` → `s_social_publish`

## WhatsApp

Shared mission / artifact / approval state only. No second WhatsApp content engine.
Signed deep links remain tenant-scoped.

## Tests

```bash
npm run test:workforce-social
npm run test:social
npm run test:social-final-artifact
npm run test:social-package-autopilot
npm run test:social-whatsapp-bridge
```

## Ownership boundary

- Owns: `lib/social/**`, Social workforce adapters, receipts, schedule semantics, Social tenant binding
- Does **not** own: canonical capability registry (WS1), image/video providers (WS3), global quality/compliance policy redesign (WS9)
