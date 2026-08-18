# StratXcel Free Audit: Comprehensive Failure Mode & Recovery Matrix

**System:** Automatic Audit Generation Engine V1  
**Last Updated:** 2026-08-18  

---

## 1. Stage-by-Stage Failure & Recovery Matrix

| Pipeline Stage | Potential Failure Mode | Root Cause / Trigger | Detection Mechanism | Recovery & Fallback Action | Terminal Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Onboarding / Intake** | Malformed URL / Private IP (SSRF) | Invalid domain or RFC1918 private address | `assertSafePublicHttpUrl` validation | Rejects with HTTP 400 `INVALID_URL` or `UNSAFE_URL` | Handled at client; user prompted to re-enter |
| **1. Onboarding / Intake** | Unreachable Website (DNS / Timeout) | Target domain down or timeout > 6s | `runSmartWebsiteDiscovery` abort signal | Marks `isReachable: false`, sets stage `IDEA`, generates starter goals | Proceed with `IDEA` / `BUSINESS_PLAN` intake |
| **2. Audit Run Creation** | Database RPC Failure (`start_automatic_audit_generation_v1`) | Duplicate order constraint or RLS violation | RPC return `success: false` / error | Marks order `status: 'in_review'` and logs non-fatal trace | Order queued for manual staff review |
| **3. Serverless Dispatch** | Lambda Container Suspension | Next.js API route returns before promise resolves | `heartbeat_at` staleness (> 25s) | Polling checkout route detects stalled run and resumes execution | Resumes and completes via next client poll or cron |
| **4. Queue Enqueuing** | Queue Consumer Inactive / Missing Daemon | Serverless environment without persistent daemon | `queue_jobs` status remaining `QUEUED` | Vercel Cron worker (`/api/platform/audit/worker`) drains pending jobs | Processed automatically every 5 minutes |
| **5. Research Provider** | Google Search Grounding Rate Limit / HTTP 429 | Quota exhaustion on Gemini v1beta | `AIRuntime` error classifier (`RATE_LIMIT`) | Circuit breaker switches candidate to `OPENAI_STANDARD_FALLBACK` (GPT-4o-mini) | Seamless failover with evidence cited |
| **5. Research Provider** | Sparse Public Web Presence (`INSUFFICIENT_EVIDENCE`) | Business is brand new with no indexed websites | Grounding returns < 3 sources or 0 web results | Merges first-party Brand Brain evidence and tags `INSUFFICIENT_PUBLIC_PRESENCE` | `PASS` with honest limitations disclosed |
| **5. Research Provider** | Provider Timeout / Network Drop | Remote AI endpoint hangs > 45s | `AbortController` timeout in `AIRuntime` | Retries attempt (up to 3x); updates `heartbeat_at` | `RETRY` (attempts < 3) or `NEEDS_REVIEW` |
| **6. Report Provider** | AI Model Returns Malformed / Non-JSON | Schema parsing error on AI output | `REPORT_SCHEMA` validation in `normalizeAuditReport` | Re-attempts generation or falls back to standard report structure | Retried or flagged `NEEDS_REVIEW` |
| **6. Report Provider** | Budget Limit Exceeded | Token consumption exceeds `$1.50` cap | `remainingAuditBudgetUsd` check | Fails closed with code `AUDIT_BUDGET_EXHAUSTED` | `NEEDS_REVIEW` (prevents runaway spend) |
| **7. Quality Gate** | Hallucinated / Uncited Finding Sources | Report cites source IDs not present in evidence | `evaluateAuditReportQuality` citation check | Penalizes quality score (< 0.80), marks `LOW_CONFIDENCE` | `NEEDS_REVIEW` (staff review required) |
| **7. Quality Gate** | Category Score Without Supporting Proof | Score assigned when evidence is missing | `inventedCategoryScores` validator | Enforces `null` ("Not enough data") or penalizes score | Quality gate fails closed to `NEEDS_REVIEW` |
| **8. Delivery / Completion** | Order Cancelled / Refunded Mid-Generation | Customer refunded while AI was processing | `stopIfClosed` check in `pipeline.ts` | State machine halts immediately with status `STOPPED` | `STOPPED` (no report delivered) |
| **8. Delivery / Completion** | Database Completion RPC Conflict | Concurrent worker delivery against completed order | RPC `already_completed` return | Idempotent acknowledgment; no duplicated writes | `COMPLETED` (idempotent success) |
| **9. Frontend Polling** | Stalled Progress Bar | Client receives unchanged stage | 5-second polling interval against `/api/platform/audit/checkout` | Server checks `heartbeat_at`; runs step synchronously within budget | Progress bar advances smoothly to next step |

---

## 2. External Provider Resilience Architecture

```
                       ┌────────────────────────┐
                       │  Audit Execution Task  │
                       └───────────┬────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
       ┌────────────────────────┐   ┌────────────────────────┐
       │   Primary: Google AI   │   │  Fallback: OpenAI API  │
       │   (Gemini 2.5/3.6)     │   │   (GPT-4o-mini/GPT-5)  │
       └────────────┬───────────┘   └─────────────┬──────────┘
                    │ (Failure/Timeout)           │ (Active)
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │ Grounded Evidence Synthesizer │
                   └───────────────┬───────────────┘
                                   │ (If Sparse Evidence)
                                   ▼
                   ┌───────────────────────────────┐
                   │ Brand Brain First-Party Proof │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                   ┌───────────────────────────────┐
                   │   Automated Quality Gate      │
                   │   (Score >= 0.80 -> Pass)     │
                   └───────────────────────────────┘
```

### Provider Isolation Rules:
1. **Never Throw Uncaught Rejections:** Every external call (`fetch`, AI completions, OAuth lookups, Google Maps parsing) is wrapped in try/catch blocks with bounded timeouts.
2. **Budget Envelopes:** AI completions are bounded by hard financial caps (`$1.50` maximum per automatic audit run).
3. **Privacy Boundary:** Internal database IDs, payment tokens, GSTIN invoices, and passwords are unconditionally stripped by `buildAuditProviderBusinessContext` and verified by `assertAuditProviderContextPrivacy` before transmission to external AI providers.
4. **Transparent Degradation:** When an external channel is disconnected or unavailable, the engine generates actionable recommendations on how to launch/connect that channel rather than halting execution.
