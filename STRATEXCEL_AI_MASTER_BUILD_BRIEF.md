# StratExcel AI — Master Claude Code Build & Consolidation Brief

**Version:** 1.0  
**Date:** 3 August 2026  
**Primary output:** Build all technically achievable parts and generate a precise `MANUAL_SETUP_REQUIRED.md` containing only external approvals, credentials, account-owner actions, KYC, DNS, OAuth consent and business decisions that cannot be completed automatically.

> This Markdown document is the authoritative master specification for Claude Code. The Word and PDF copies are human-readable reference versions only.

## Master directive

You are Claude Code acting as the principal engineer, security reviewer, migration lead and release manager for the existing StratExcel ecosystem. This is not a greenfield demo. Multiple repositories, Vercel projects, domains, OAuth applications, webhooks, databases and working integrations already exist. Discover the live state, preserve validated work, consolidate useful systems into one canonical StratExcel AI product, integrate Hermes as a restricted execution engine, test the complete platform, deploy only after release gates pass, and produce exact handoff documentation for remaining manual actions.

### Product relationship

- **Claude Code:** builds, migrates, tests and maintains the platform.
- **StratExcel AI:** customer product and source of truth for tenants, Brand Brain, missions, money, permissions, approvals, publishing and audit.
- **Hermes:** restricted execution engine for research, content, SEO, development, media and operations.
- **Supabase:** auth, RLS, application state, missions, events, wallet and audit.
- **Vercel:** frontends and short-lived APIs, never unbounded agent execution.
- **Human agents:** regulated, physical, exceptional or high-risk tasks.

## Known discovery leads — re-resolve before editing

- Preferred canonical candidate: `Jack160699/stratxcel-automation-platform`.
- Migration source: `Jack160699/ai-automation-system`.
- Relevant Vercel projects include `stratxcel`, `ai-os-ai-os`, `stratxcel-os`, `ai-os`, and `stratxcel-site`.
- Domains include `stratxcel.in`, `www.stratxcel.in`, `stratxcel.vercel.app`, and `app.stratxcel.in`.
- Current Supabase access has historically mixed Jan Darpan and StratExcel data. Final StratExcel client production must use a dedicated project or a safe staged separation. Do not damage Jan Darpan.
- Preserve active Meta, WhatsApp, Google, YouTube and social verification work.
- Preserve the working WhatsApp bot and Razorpay flows while migrating them safely.

## Non-negotiable rules

1. Re-resolve live Git, Vercel, Supabase, deployment and callback state.
2. Do not blind-merge repositories or delete legacy systems before stable cutover.
3. Do not expose secret values in code, prompts, logs, reports or Hermes memory.
4. Hermes never receives raw tokens, service-role keys, payment secrets, unrestricted SQL or unrestricted shell.
5. Long missions must be asynchronous; return IDs immediately and persist events/artifacts.
6. Irreversible actions require policy or approval.
7. Every record and request must be tenant-scoped and server-authorised.
8. Maintain backups, rollback references and reversible migrations.
9. Do not report external approvals as completed merely because code/evidence is prepared.

## Required discovery documents

Create under `docs/discovery/`:

- `SYSTEM_INVENTORY.md`
- `REPOSITORY_CAPABILITY_MATRIX.md`
- `VERCEL_DOMAIN_DEPLOYMENT_MAP.md`
- `SUPABASE_DATA_AND_RLS_MAP.md`
- `OAUTH_WEBHOOK_CALLBACK_MAP.md`
- `MIGRATION_AND_ROLLBACK_PLAN.md`
- `RISK_REGISTER.md`

## Target architecture

```text
stratxcel-ai/
├── apps/web
├── apps/dashboard
├── apps/admin
├── apps/worker
├── services/hermes-gateway
├── services/whatsapp
├── services/publishing
├── services/notifications
├── services/media-processing
├── packages/auth-and-rbac
├── packages/tenants
├── packages/brand-brain
├── packages/mission-engine
├── packages/service-catalogue
├── packages/approvals
├── packages/social-providers
├── packages/website-connectors
├── packages/payments-and-wallet
├── packages/byok-vault
├── packages/storage-connectors
├── packages/human-handoff
├── packages/audit-and-observability
├── supabase/migrations
├── infrastructure/hermes
└── docs
```

### Runtime flow

```text
WhatsApp / Dashboard
→ identity + tenant + Brand Brain
→ goal-to-mission compiler
→ policy + pricing + wallet reservation
→ persisted mission + async queue
→ Hermes profile with restricted tools
→ events + artifacts + blockers
→ approval / human handoff / bounded automation
→ secure StratExcel publisher or deployment service
→ receipts + analytics + billing + report
```

## Required product modules

- Multi-tenant auth, invitations, roles and RLS.
- Business onboarding and versioned Brand Brain.
- Plain-message goal-to-mission compiler.
- Structured service catalogue.
- Customer dashboard and WhatsApp conversation continuity.
- Admin/operator workspace.
- Hermes runtime adapter, profiles, events and restricted tool gateway.
- Managed AI credits, BYOK and hybrid routing.
- Google Drive/BYOS and temporary processing storage.
- Social OAuth, approvals, scheduling, publishing receipts and analytics.
- Website/repository connections, branches, previews and approved deployment.
- SEO audit/change/report workflows.
- Razorpay subscriptions, checkout, wallet reservations and immutable ledger.
- Human handoff with complete context.
- Audit, security, provider health, dead letters and recovery.

## Hermes requirements

Implement a stable `AgentRuntimeAdapter` and a `HermesRuntimeAdapter`. Use signed server-to-server authentication, idempotent mission creation, persistent events, cancellation, retry and health checks.

Mission states:

```text
DRAFT → ESTIMATING → AWAITING_FUNDS/READY → QUEUED → RUNNING
→ AWAITING_INPUT/AWAITING_APPROVAL/HUMAN_HANDOFF → RESUMED
→ COMPLETED/PARTIALLY_COMPLETED/FAILED/CANCELLED/BLOCKED
```

Profiles:

- `stratxcel-orchestrator`
- `stratxcel-research`
- `stratxcel-content`
- `stratxcel-developer`
- `stratxcel-seo`
- `stratxcel-admin-growth`

Hermes may use narrow tools such as `get_client_brand_context`, `create_content_draft`, `upload_artifact`, `request_content_approval`, `publish_approved_content`, `get_publication_status`, `deploy_preview`, `request_production_deploy`, `create_human_handoff`, and usage/ledger tools. It must never receive generic unrestricted SQL, shell, credential-return, role-change, refund or arbitrary publish/deploy tools.

## Build phases

0. Safe workspace, backups, baseline tests and `BUILD_STATUS.md`.
1. Full discovery and canonical architecture decision.
2. Platform foundation: monorepo boundaries, tenants, auth, RBAC, audit, dedicated Supabase migrations.
3. Brand Brain, service catalogue, mission compiler and dashboard.
4. Migrate/preserve WhatsApp and Razorpay with test verification.
5. Preserve and integrate social providers without breaking reviews.
6. Local Hermes deployment, async gateway, profiles, tools, events and artifacts.
7. BYOK, Drive/BYOS, plans, wallet and provider usage.
8. v1 service workflows: audit, social campaign, content calendar, website/landing page, SEO audit, proposal and report.
9. Human handoff and admin growth mode.
10. Security, RLS, idempotency, rate limits, redaction, provider health and observability.
11. Preview, shadow runs, controlled cutover and rollback verification.

## Required tests

- Install, lint, typecheck, unit, integration, database migration, RLS, webhook security, build and preview gates.
- Cross-tenant denial across database, APIs, Realtime and files.
- Plain message to structured/estimated mission.
- Async Hermes run with refresh-safe progress, revision, approval and cancellation.
- WhatsApp tenant mapping and deduplication.
- Razorpay test payment/webhook and wallet reconciliation.
- BYOK encryption and no secret leakage.
- Google Drive transfer and revoked-access handling.
- Private/test social publish exactly once with receipt.
- Website branch/test/preview without unapproved production change.
- Human handoff and return to originating mission.
- Provider outage/fallback/blocker behaviour.
- Rollback readiness.

## Required final files

Before declaring completion, create and commit:

- `FINAL_RELEASE_REPORT.md`
- `MANUAL_SETUP_REQUIRED.md`
- `LIVE_SYSTEM_MAP.md`
- `SECRETS_AND_CALLBACKS_CHECKLIST.md`
- `RUNBOOK.md`
- `SECURITY_MODEL.md`
- `HERMES_SKILLS_AND_TOOLS.md`
- `DATA_MIGRATION_REPORT.md`
- `EXTERNAL_APPROVAL_STATUS.md`

### `MANUAL_SETUP_REQUIRED.md`

For every remaining manual action include:

- stable ID and priority
- system
- exact action
- why it cannot be automated
- exact dashboard/location
- prerequisites
- names of values/documents required, never secrets
- numbered steps
- success verification
- impact if skipped
- code readiness

Do not hide unfinished coding work in the manual file.

## Completion response

Return:

1. READY / PARTIALLY READY / BLOCKED
2. canonical repository and branch
3. Git SHA and PR
4. Vercel projects, deployment IDs and domains
5. Supabase project and migrations
6. Hermes mode and health
7. completed features
8. verified integrations
9. tests and shadow/live verification
10. security and tenant-isolation result
11. migration and rollback result
12. remaining manual actions linked to `MANUAL_SETUP_REQUIRED.md`
13. limitations and next safe phase

Do not declare completion if placeholders, mocks, broken routes, untested webhooks, missing RLS or uncontrolled irreversible actions remain.
