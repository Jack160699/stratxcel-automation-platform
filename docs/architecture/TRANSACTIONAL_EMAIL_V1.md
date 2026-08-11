# Transactional Email System — V1

## Purpose

Stratxcel V1 ships **one** provider-neutral transactional email subsystem:

`domain event → typed email event → template render → recipient validation → idempotency check → durable outbox → provider send → provider receipt → delivery state → retry/backoff → safe failure visibility`

Email is a **notification side effect**. It must never become the authority for payments, missions, approvals, or subscriptions.

## Package

`packages/email-runtime` (`@stratxcel/email-runtime`)

Key surfaces:

| Area | Location |
|------|----------|
| Event contracts | `src/events.ts` |
| Delivery readiness vocabulary | `src/delivery-status.ts` |
| Canonical app origin | `src/app-origin.ts` |
| Templates (HTML + text) | `src/templates/render.ts` |
| Recipient / header safety | `src/recipient.ts` |
| Provider interface | `src/types.ts` (`EmailProvider`) |
| Resend adapter | `src/providers/resend.ts` |
| In-memory/fake provider | `src/providers/in-memory.ts` |
| Durable outbox enqueue | `src/outbox/enqueue.ts` |
| Outbox stores | `src/outbox/postgres-store.ts`, `memory-store.ts` |
| Processor + backoff | `src/processor/` |
| System Health probe | `src/health.ts` |
| Payment / approval / mission / support / renewal hooks | `src/integrations/` |

## Architecture flow

1. An authoritative business transition commits (payment CAPTURED, approval inserted, mission terminal, handoff created, renewal scan).
2. Application code calls a best-effort `enqueue*` helper (never inside the payment RPC transaction).
3. `enqueueTransactionalEmail` validates recipient, renders template v1, inserts `email_outbox` with unique `(event_type, idempotency_key, recipient)`.
4. **Primary processor:** independent poll loop inside `apps/mission-worker` (`EMAIL_PROCESSOR_MODE=mission-worker`, worker heartbeat `email-processor`). Continues even when no missions exist / Hermes disabled / Social disabled.
5. **Backup processor:** authenticated `POST /api/internal/email/process` (`CRON_SECRET`) for manual/ops recovery. **Not** scheduled via Vercel sub-daily cron (Hobby-incompatible). Scheduler on Vercel for email = **NOT_CONFIGURED**.
6. On success: persist real `provider_message_id`, status `SENT`, clear lease metadata.
7. On retryable failure: `RETRY_WAIT` with bounded backoff; clear lease metadata.
8. On permanent / config failure: `FAILED` or `WAITING_CONFIGURATION`; clear lease metadata.
9. When provider **readiness probe** proves `configured && reachable && senderVerified`, `recover_email_outbox_waiting_configuration` re-enters eligible rows to `PENDING` (preserves `attempt_count`, never resurrects `CANCELLED` / invalid recipients). Key presence alone must never recover parked rows (avoids 401/unverified churn).

## Free-plan / Hobby compatibility

Transactional email delivery must remain compatible with a future Vercel Hobby downgrade:

- No `*/5` (or other sub-daily) Vercel cron for `/api/internal/email/process`
- Durable `email_outbox` + long-running mission-worker email loop
- Optional HTTP processor endpoint remains for manual/backup execution only

## Events (V1) — contract vs producer

Delivery readiness must distinguish:

`CONTRACT_READY` / `PRODUCER_WIRED` / `PRODUCER_NOT_AVAILABLE` / `PRODUCER_NOT_READY` / `OUTBOX_READY` / `PROCESSOR_READY` / `PROVIDER_READY` / `LIVE_VERIFIED`

| Event | Producer status | Notes |
|-------|-----------------|-------|
| `ACCOUNT_WELCOME` | `PRODUCER_NOT_AVAILABLE` | Contract/template ready. Signup is client `supabase.auth.signUp()`; Supabase Auth owns confirmation mail. No safe authoritative app-side post-create hook. |
| `AUDIT_PAYMENT_RECEIPT` | `PRODUCER_WIRED` | After Razorpay webhook CAPTURED `audit_fee` |
| `SUBSCRIPTION_ACTIVATED` | `PRODUCER_WIRED` | Lifecycle webhook |
| `SUBSCRIPTION_PAYMENT_SUCCESS` | `PRODUCER_WIRED` | CAPTURED subscription payment |
| `SUBSCRIPTION_PAYMENT_FAILED` | `PRODUCER_WIRED` | halted / pending |
| `SUBSCRIPTION_RENEWAL_UPCOMING` | `PRODUCER_WIRED` | `/api/internal/subscriptions/renew` pre-renewal scan; skips `cancel_at_period_end` / cancelled / expired / paused |
| `SUBSCRIPTION_RENEWED` | `PRODUCER_WIRED` | After charge; `periodEnd` from `subscriptions.current_period_end` (never payment `paidAt`) |
| `SUBSCRIPTION_CANCEL_SCHEDULED` | `PRODUCER_WIRED` | Cancel at period end |
| `SUBSCRIPTION_CANCELLED` | `PRODUCER_WIRED` | Immediate cancel |
| `INVOICE_OR_RECEIPT_READY` | `PRODUCER_WIRED` | Other fulfilled payments |
| `APPROVAL_REQUIRED` | `PRODUCER_WIRED` | After `requestApproval` insert |
| `MISSION_COMPLETED` / `MISSION_FAILED` | `PRODUCER_WIRED` | Mission-worker terminal states |
| `SUPPORT_ESCALATION_CREATED` | `PRODUCER_WIRED` | After `createHumanHandoff` |
| `IMPORTANT_ACCOUNT_NOTICE` | helper available | Optional notices |

Each contract defines: template key/version, required payload keys, priority, **per-event `maxAttempts`**, tenant requirement, idempotency identity. Processor honors contract `maxAttempts` (fallback to global only for malformed/legacy rows).

## Templates

- Plain text + HTML for every message
- Stratxcel identity, support/reply-to, safe footer
- No fake guarantees (no ROAS / revenue / ranking claims)
- Template versioning via `template_version` (currently `1` for all)

## Canonical application URL

Approval and account links use `resolveCanonicalAppOrigin`:

1. `NEXT_PUBLIC_APP_URL`
2. `APP_BASE_URL`
3. default `https://www.stratxcel.in`

Never derive the app origin from `SUPPORT_EMAIL` / `@stratxcel.ai`.

## Idempotency

Unique index:

`email_outbox (event_type, idempotency_key, recipient)`

Examples:

- `AUDIT_PAYMENT_RECEIPT` → `audit_receipt:{paymentOrderId}`
- `SUBSCRIPTION_RENEWED` → `sub_renewed:{subscriptionId}:{currentPeriodEnd}`
- `SUBSCRIPTION_RENEWAL_UPCOMING` → `sub_renew_upcoming:{subscriptionId}:{currentPeriodEnd}`
- `ACCOUNT_WELCOME` (when wired) → `welcome:{userId}`
- `APPROVAL_REQUIRED` → `approval_required:{approvalId}`
- `MISSION_COMPLETED` → `mission_completed:{missionId}`

Webhook replay / route retry / worker restart must not double-send.

## Retry policy

Global backoff table (capped by per-event `maxAttempts`):

| Attempt | Delay |
|---------|-------|
| 1 | +1 min |
| 2 | +5 min |
| 3 | +30 min |
| 4 | +2 hr |
| 5+ | terminal `FAILED` (if contract allows that many) |

Retryable: `408`, `429`, `5xx`, network, **timeout**.

Permanent: invalid recipient, auth/config, sender unverified, hard provider rejection → `FAILED` or `WAITING_CONFIGURATION`.

## Provider configuration

Preferred V1 provider: **Resend**.

Environment variables (never commit secrets):

| Name | Role |
|------|------|
| `EMAIL_PROVIDER` | `resend` (default) or `in-memory` for tests |
| `RESEND_API_KEY` | Server-only Resend API key |
| `EMAIL_FROM` | From header (e.g. `Stratxcel <support@stratxcel.ai>`) |
| `EMAIL_REPLY_TO` | Reply-To |
| `SUPPORT_EMAIL` | Canonical support mailbox (default `support@stratxcel.ai`) |
| `BILLING_EMAIL` / `SECURITY_EMAIL` / `GRIEVANCE_EMAIL` | Contact mailboxes |
| `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` | Product UI origin (default `https://www.stratxcel.in`) |
| `EMAIL_PROVIDER_TIMEOUT_MS` | Resend send timeout (default 15000) |
| `EMAIL_PROBE_TIMEOUT_MS` | Readiness probe timeout (default 5000) |
| `EMAIL_PROCESSOR_MODE` | `mission-worker` (set by worker) or `http-manual-with-external-scheduler` |
| `EMAIL_OUTBOX_POLL_INTERVAL_MS` | Mission-worker email poll interval |
| `EMAIL_TEST_MODE` | Allow test recipients when `1` |
| `EMAIL_LIVE_SMOKE_TEST` / `EMAIL_LIVE_SMOKE_TO` | Manual live smoke only |
| `CRON_SECRET` | Protects backup `/api/internal/email/process` |

## Outbox lifecycle

Statuses: `PENDING` → `PROCESSING` → `SENT` | `RETRY_WAIT` | `FAILED` | `CANCELLED` | `WAITING_CONFIGURATION`

Migrations:

- `supabase/migrations/20260813120000_transactional_email_outbox.sql`
- `supabase/migrations/20260813140000_email_outbox_waiting_configuration_recovery.sql`

Lease fields (`lease_owner`, `lease_expires_at`) are cleared on `SENT` / `RETRY_WAIT` / `FAILED` / `WAITING_CONFIGURATION` / `CANCELLED`.

## Security model

- Outbox contains PII → RLS enabled, **no** `anon`/`authenticated` grants
- Writes only via service-role after normal authorization in app/worker code
- Clients cannot insert arbitrary emails
- Logs never include API keys, auth headers, or full sensitive bodies beyond safe operational fields
- Header injection blocked on subject / from / reply-to / recipient

## System Health semantics

Email status is **never** `OPERATIONAL` merely because `RESEND_API_KEY` is set, and **never** assumes `workerPathAvailable: true`.

| Status | Meaning |
|--------|---------|
| `NOT_CONFIGURED` | No API key |
| `CONFIGURED` | Key present but provider not reachable |
| `REACHABLE` | Provider reachable; sender verification unknown |
| `SENDER_UNVERIFIED` | Sender/domain not verified |
| `DEGRADED` | Provider OK but outbox inaccessible **or processor path not proven** |
| `OPERATIONAL` | Key + reachable + sender verified + outbox OK + **processor evidence** (recent `email-processor` heartbeat or explicit supported scheduler mode) |

Admin UI: `/admin/system` Email row (modular alongside other integrations; keep mergeable vs PR #45 AI Health).

## Live smoke procedure

1. Set `EMAIL_LIVE_SMOKE_TEST=1`
2. Set `EMAIL_LIVE_SMOKE_TO` to an owned inbox
3. Configure `RESEND_API_KEY` + verified `EMAIL_FROM`
4. Run a dedicated smoke script/test **manually** (not in CI defaults)
5. Unset the live flags immediately after

This task does **not** run live smoke.

## Manual DNS / sender steps still required

These cannot be coded in-repo:

1. Create/verify Resend domain for `stratxcel.ai` (SPF/DKIM/DMARC as Resend instructs)
2. Verify sending domain / from address in Resend dashboard
3. Provision mailbox `support@stratxcel.ai` (and billing/security/grievance if separate)
4. Set production env vars in Vercel (`RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, etc.)
5. Apply outbox + recovery migrations to the target Supabase project (not done by this PR)
6. Run `apps/mission-worker` so `email-processor` heartbeats prove the processor path

## Integration hooks

| Source | Hook |
|--------|------|
| `app/api/webhook/razorpay/route.ts` | best-effort email after `markWebhookEventProcessed` |
| `packages/approvals` | after `requestApproval` insert |
| `packages/human-handoff` | after `createHumanHandoff` |
| `apps/mission-worker` | terminal mission notify + **independent email outbox poll** |
| `app/api/internal/subscriptions/renew` | upcoming-renewal enqueue (best-effort) |
| `app/api/internal/email/process` | authenticated **manual/backup** processor (not Vercel */5 cron) |

## Tests

```bash
npm run test:email-runtime
```

Plus payment/subscription/security/worker regression suites listed in the delivery checklist.

## PR #45 conflict awareness

PR #45 also touches `.env.example`, `app/admin/(shell)/system/page.tsx`, `package.json`, `package-lock.json`. Keep #46 independent; Email System Health is a separate modular row so later merge need not choose between AI Health and Email Health.
