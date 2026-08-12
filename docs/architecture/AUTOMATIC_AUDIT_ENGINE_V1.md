# Automatic Business Audit Engine V1

## Release contract

The engine turns one verified ₹999 Audit order and one immutable Brand Brain version into one evidence-backed report. The normal path is automatic; staff participate only when research, quality, or delivery needs recovery.

`audit_orders` remains the commercial and payment source of truth. `audit_generation_runs` is additive operational state and is unique by Audit order plus Brand Brain version. Queue idempotency uses the same pair. Repeated intake finalization, worker delivery, and completion calls reuse the durable run instead of generating or completing twice.

The engine is fail-closed. `AUDIT_AUTOMATION_ENABLED` defaults off and this change does not enable it in any environment.

## Execution path

1. The server verifies the order, fixed ₹999 fee, paid Audit payment link, tenant, and finalized Brand Brain version.
2. Brand Brain finalization and `audit.generate_v1` queue creation occur through one database function and transaction.
3. The existing Mission Worker claims the job and persists each stage: `RESEARCH`, `ANALYSIS`, `QUALITY_GATE`, `DELIVERY`.
4. Grounded research uses provider-neutral evidence from Gemini Google Search grounding or OpenAI web search. Sources are normalized, URL-checked, bounded, and optionally verified without cookies or credentials. Public content is always treated as untrusted data.
5. Report generation uses `@stratxcel/ai-runtime`, the versioned Brand Brain, and only the normalized evidence packet.
6. A deterministic gate checks required report sections, personalization, source diversity, finding-level citations, confidence, contradictions, and placeholders.
7. Only `PASS` reaches the service-role automatic-completion function. The existing staff completion function v5 and the valid-report database trigger are unchanged.
8. `LOW_CONFIDENCE`, `INSUFFICIENT_EVIDENCE`, `GENERATION_FAILED`, and `RESEARCH_FAILED` enter the admin recovery queue. Transient failures retry with bounded attempts. Cancellation or refund stops processing.

The worker re-reads the order before each provider call and immediately before the completion transition. Automatic completion records `completed_by = null`, automation provenance, and an immutable `platform_admin_events` entry.

## Data exposure

The generation table is service-role-only. It contains draft research, failed output, and provider receipts and therefore has no customer-role table grant. The authenticated customer route first proves tenant membership, then returns only safe stage, outcome, confidence, and recovery messaging. Customers receive the report through the existing completed `audit_orders.report_data` path.

## Model and cost policy

Gemini standard is primary. OpenAI mini is the normal cross-provider fallback. OpenAI Terra is considered only when `AUDIT_PREMIUM_FALLBACK_ENABLED=true`, after a justified quality failure, and while the per-Audit budget remains available. Sol is not in the Audit V1 route.

The default hard envelope is USD 1.50 per Audit and is server-authoritative; accepted configuration is clamped to USD 0.25–5.00. Provider receipts and estimated token/tool costs accumulate on the run.

Planning ranges, not invoices:

| Path | Expected internal cost per report |
|---|---:|
| Normal Gemini grounded research + Gemini report | USD 0.15–0.35 |
| Cross-provider fallback after a partial/failed attempt | USD 0.30–0.75 |
| Premium-enabled exceptional path | Up to the configured hard envelope |
| Default absolute per-Audit envelope | USD 1.50 |

Actual provider billing remains authoritative. The ranges assume bounded source verification, at most eight retained sources, at most six direct verification fetches, and one research plus one report result. Retries reuse persisted passing research.

## Migration history decision

Production already records `20260812120051_audit_report_delivery_invariant`, followed by the AI execution migrations through `20260812150000_ai_usage_attempt_idempotency`. The earlier repository delivery-invariant filename is not rewritten or reapplied.

Automatic Audit V1 uses the new, unique version `20260812170000_automatic_audit_engine_v1.sql`. This intentionally sorts after current production and after the stale PR #48 research migration version. No production migration was run while building this branch.

## Activation runbook (documentation only)

Do not activate from this branch before approval and merge.

1. Confirm the exact merged commit and a green production build artifact.
2. Back up and inspect production migration history; confirm `20260812170000` is absent and all earlier production versions remain unchanged.
3. Apply only the reviewed additive migration in the normal Supabase release process.
4. Deploy the web application and existing Mission Worker with `AUDIT_AUTOMATION_ENABLED=false`.
5. Confirm worker health, queue permissions, completion-trigger behavior, and admin exception visibility using non-billable fixtures.
6. Configure `AUDIT_AI_HARD_BUDGET_USD` (recommended initial value `1.50`). Keep premium fallback off initially.
7. Enable `AUDIT_AUTOMATION_ENABLED=true` for a controlled cohort, monitor delivery quality, cost receipts, queue age, and review rate, then expand deliberately.

No real payment is required for activation verification. Use a verified test-mode fixture/order through the approved payment test path.

## Kill switch and rollback

Set `AUDIT_AUTOMATION_ENABLED=false` to stop new automatic enqueueing. The shared worker kill switch can halt execution if broader queue isolation is required. Already queued jobs remain durable and can be inspected; cancelled/refunded orders stop at their next guard.

Application rollback does not require destructive database rollback. Leave the additive table, functions, grants, events, and history intact. With the flag off, the existing staff-assisted Audit path remains available. Never delete migration-history entries or rewrite an applied migration.

## Verification

The deterministic fixture suite covers paid order → finalized Brand Brain → queued run → grounded fixture research → rich report → `PASS` → exactly-once completion and retrieval. It also covers insufficient evidence, low quality, retry exhaustion, reused research, duplicate delivery, unknown citations, contradictions, and cancellation/refund before provider and delivery boundaries. Live provider calls, real payments, production migrations, and production deployment are excluded from release tests.
