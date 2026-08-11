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
| Templates (HTML + text) | `src/templates/render.ts` |
| Recipient / header safety | `src/recipient.ts` |
| Provider interface | `src/types.ts` (`EmailProvider`) |
| Resend adapter | `src/providers/resend.ts` |
| In-memory/fake provider | `src/providers/in-memory.ts` |
| Durable outbox enqueue | `src/outbox/enqueue.ts` |
| Outbox stores | `src/outbox/postgres-store.ts`, `memory-store.ts` |
| Processor + backoff | `src/processor/` |
| System Health probe | `src/health.ts` |
| Payment / approval / mission / support hooks | `src/integrations/` |

## Architecture flow

1. An authoritative business transition commits (payment CAPTURED, approval inserted, mission terminal, handoff created).
2. Application code calls a best-effort `enqueue*` helper (never inside the payment RPC transaction).
3. `enqueueTransactionalEmail` validates recipient, renders template v1, inserts `email_outbox` with unique `(event_type, idempotency_key, recipient)`.
4. Cron `/api/internal/email/process` (every 5 minutes, `CRON_SECRET`) claims rows via `claim_email_outbox_batch` and sends through `EmailProvider`.
5. On success: persist real `provider_message_id`, status `SENT`.
6. On retryable failure: `RETRY_WAIT` with bounded backoff.
7. On permanent / config failure: `FAILED` or `WAITING_CONFIGURATION`.

## Events (V1)

| Event | Typical trigger |
|-------|-----------------|
| `ACCOUNT_WELCOME` | Account lifecycle (available; wire when welcome path is ready) |
| `AUDIT_PAYMENT_RECEIPT` | Audit ₹999 payment CAPTURED via Razorpay webhook/reconcile |
| `SUBSCRIPTION_ACTIVATED` | `subscription.activated` / authenticated lifecycle |
| `SUBSCRIPTION_PAYMENT_SUCCESS` | Subscription charge CAPTURED |
| `SUBSCRIPTION_PAYMENT_FAILED` | `subscription.halted` / `pending` |
| `SUBSCRIPTION_RENEWAL_UPCOMING` | Available for renewal cron notices |
| `SUBSCRIPTION_RENEWED` | Successful recurring charge |
| `SUBSCRIPTION_CANCEL_SCHEDULED` | Cancel at period end |
| `SUBSCRIPTION_CANCELLED` | Immediate cancel |
| `INVOICE_OR_RECEIPT_READY` | Other fulfilled payment purposes |
| `APPROVAL_REQUIRED` | `requestApproval` after insert |
| `MISSION_COMPLETED` | Mission worker terminal success |
| `MISSION_FAILED` | Final mission failure only (not retryable) |
| `SUPPORT_ESCALATION_CREATED` | `createHumanHandoff` → `SUPPORT_EMAIL` |
| `IMPORTANT_ACCOUNT_NOTICE` | Optional customer ack / notices |

Each contract defines: template key/version, required payload keys, priority, max attempts, tenant requirement, idempotency identity.

## Templates

- Plain text + HTML for every message
- Stratxcel identity, support/reply-to, safe footer
- No fake guarantees (no ROAS / revenue / ranking claims)
- Template versioning via `template_version` (currently `1` for all)

## Idempotency

Unique index:

`email_outbox (event_type, idempotency_key, recipient)`

Examples:

- `AUDIT_PAYMENT_RECEIPT` → `audit_receipt:{paymentOrderId}`
- `SUBSCRIPTION_RENEWED` → `sub_renewed:{paymentOrderId}`
- `APPROVAL_REQUIRED` → `approval_required:{approvalId}`
- `MISSION_COMPLETED` → `mission_completed:{missionId}`

Webhook replay / route retry / worker restart must not double-send.

## Retry policy

| Attempt | Delay |
|---------|-------|
| 1 | +1 min |
| 2 | +5 min |
| 3 | +30 min |
| 4 | +2 hr |
| 5+ | terminal `FAILED` |

Retryable: `408`, `429`, `5xx`, network, timeout.

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
| `BILLING_EMAIL` | Billing contact |
| `SECURITY_EMAIL` | Security contact |
| `GRIEVANCE_EMAIL` | Grievance contact |
| `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` | Links back to product UI |
| `EMAIL_TEST_MODE` | Allow test recipients when `1` |
| `EMAIL_LIVE_SMOKE_TEST` | Must be `1` to send a real smoke email |
| `EMAIL_LIVE_SMOKE_TO` | Explicit smoke recipient |
| `CRON_SECRET` | Protects `/api/internal/email/process` |

## Outbox lifecycle

Statuses: `PENDING` → `PROCESSING` → `SENT` | `RETRY_WAIT` | `FAILED` | `CANCELLED` | `WAITING_CONFIGURATION`

Table: `public.email_outbox`  
Migration: `supabase/migrations/20260813120000_transactional_email_outbox.sql`

Future delivery webhooks can extend status with `DELIVERED` / `BOUNCED` / `COMPLAINED` without inventing them in V1.

## Security model

- Outbox contains PII → RLS enabled, **no** `anon`/`authenticated` grants
- Writes only via service-role after normal authorization in app/worker code
- Clients cannot insert arbitrary emails
- Logs never include API keys, auth headers, or full sensitive bodies beyond safe operational fields
- Header injection blocked on subject / from / reply-to / recipient

## System Health semantics

Email status is **never** `OPERATIONAL` merely because `RESEND_API_KEY` is set.

| Status | Meaning |
|--------|---------|
| `NOT_CONFIGURED` | No API key |
| `CONFIGURED` | Key present but provider not reachable |
| `REACHABLE` | Provider reachable; sender verification unknown |
| `SENDER_UNVERIFIED` | Sender/domain not verified |
| `DEGRADED` | Provider OK but outbox/worker path unhealthy |
| `OPERATIONAL` | Key + reachable + sender verified + outbox/worker OK |

Admin UI: `/admin/system` Email row.

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
4. Set production env vars in Vercel (`RESEND_API_KEY`, `EMAIL_FROM`, etc.)
5. Apply the outbox migration to the target Supabase project (not done by this PR)
6. Confirm Vercel cron hits `/api/internal/email/process` with `CRON_SECRET`

## Integration hooks

| Source | Hook |
|--------|------|
| `app/api/webhook/razorpay/route.ts` | `issueEmailRecordsBestEffort` after `markWebhookEventProcessed` |
| `packages/approvals` | after `requestApproval` insert |
| `packages/human-handoff` | after `createHumanHandoff` |
| `apps/mission-worker` | after terminal mission transition |
| `app/api/internal/email/process` | outbox processor cron |

## Tests

```bash
npm run test:email-runtime
```

Plus payment/subscription/security/worker regression suites listed in the delivery checklist.
