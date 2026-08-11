# AI Provider Router V1

## Purpose

One canonical AI execution runtime for Stratxcel reasoning/generation:

`task → classify → entitlement/budget → cheapest suitable model → execute → validate → fallback/escalate → usage → normalized result`

Deterministic workers (payments, webhooks, RLS, schedulers, publish transport, WhatsApp transport, arithmetic) stay AI-free.

## Package

`@stratxcel/ai-runtime` (`packages/ai-runtime`)

## Model catalog

Central IDs live in `packages/ai-runtime/src/catalog/models.ts`. Do not scatter model strings.

### Text / reasoning

| Key | Model |
|---|---|
| GOOGLE_CHEAP | gemini-3.5-flash-lite |
| GOOGLE_STANDARD | gemini-3.6-flash |
| OPENAI_CHEAP_FALLBACK | gpt-5.4-nano |
| OPENAI_STANDARD_FALLBACK | gpt-5.4-mini |
| OPENAI_COST_SENSITIVE_STRONG | gpt-5.6-luna |
| OPENAI_PREMIUM | gpt-5.6-terra |
| OPENAI_FRONTIER | gpt-5.6-sol |

### Image

| Key | Model |
|---|---|
| GOOGLE_IMAGE_FAST | gemini-3.1-flash-lite-image |
| GOOGLE_IMAGE_STANDARD | gemini-3.1-flash-image |
| GOOGLE_IMAGE_PREMIUM | gemini-3-pro-image |
| OPENAI_IMAGE_FALLBACK | gpt-image-2 |

### Video (async Veo only — Sora not active)

| Key | Model |
|---|---|
| GOOGLE_VIDEO_ECONOMY | veo-3.1-lite-generate-preview |
| GOOGLE_VIDEO_FAST | veo-3.1-fast-generate-preview |
| GOOGLE_VIDEO_PREMIUM | veo-3.1-generate-preview |

### Voice / audio

| Workload | Model |
|---|---|
| realtime voice | gpt-realtime-2.1-mini (fallback gemini-3.1-flash-live-preview) |
| transcription | gpt-4o-mini-transcribe |
| tts | tts-1 / tts-1-hd |
| deprecated | gpt-4o-mini-tts — not wired |

## Task classes & department map

25 departments map explicitly in `policy/department-map.ts`. Unknown tasks use conservative `GENERAL_SPECIALIST`. Sol is never a default primary.

## Fallback

Transient only: 402/408/429/5xx/timeout/network/unavailable. Max primary + fallback.

Never hop on: safety refusal, compliance, entitlement, tenant isolation, permission, approval, Shadow, invalid input.

## Quality escalation

Task-aware heuristic gate; premium/frontier only after FAIL and only for allowed classes. Sol only for STRATEGY / EXECUTIVE / PREMIUM_AUDIT / WEBSITE_ENGINEERING after justified failure.

## Monthly COGS budgets (internal USD)

Starter $8.40 · Growth $17.30 · Business $36.70 · Scale $68.20 (overrideable). Soft 70% / warn 85% / hard 100% with reserved-critical / owner-overage escapes.

## Usage accounting

Additive table `ai_execution_usage` (migration `20260812130000_ai_execution_usage.sql`) + dual-write compatible with `provider_usage_events`. Tenant RLS read. Do not apply to production in this PR alone without review.

## Social Copilot

Uses AI Runtime adapter while preserving `buildGeminiRequest` / `sanitizeGeminiText` boundary. Meta/platform data stays local.

## Creative Studio media

`AiRuntimeImageProvider` implements Creative Studio `ImageProvider`. Capability AVAILABLE only when provider configured + generation succeeds. Failed generation never fabricates `social_media_assets`.

Video: async submit/poll Veo architecture in `media/video.ts`. No Sora path.

## Hermes reality

Hermes CEO/mission reasoning remains externally configured via `HERMES_DEFAULT_MODEL` / `HERMES_DEFAULT_PROVIDER` (typically OpenRouter on the Hermes host). Stratxcel specialist **direct** AI calls use ai-runtime. Do not break live Hermes deployments for architectural purity.

## Security

- Server-only keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`)
- No secrets in logs, receipts, or client JS
- Safe user errors: “AI service temporarily unavailable”, “Usage limit reached”, “Needs human review”
- Admin System Health shows configured/reachable/circuit/budget aggregates without keys

## Enablement

See `.env.example`. Defaults match the approved catalog; env overrides are escape hatches.

## Tests

```bash
npm run test:ai-runtime
# optional live:
AI_LIVE_SMOKE_TEST=1 npm run test:ai-live-smoke
```
