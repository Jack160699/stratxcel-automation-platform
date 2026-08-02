# Secrets & Callbacks Checklist

Names only — no values. Check off once each is actually set in the relevant environment (not done by this session for any of them).

## Environment variables introduced this session

| Variable | Used by | Purpose |
|---|---|---|
| `HERMES_GATEWAY_SECRET` | dashboard app, `apps/hermes-gateway` | Signs/verifies mission-scoped tool tokens (`packages/hermes/src/token.ts`) |
| `HERMES_SHARED_SECRET` | `apps/mission-worker`, a real Hermes instance | Signs/verifies mission-worker → Hermes HTTP calls (`HermesHttpAdapter`) — only needed for `HERMES_MODE=http` |
| `HERMES_MODE` | `apps/mission-worker` | `disabled` (default) / `mock` / `http` |
| `HERMES_GATEWAY_URL` | `apps/mission-worker` (`HermesHttpAdapter`) | Where a real Hermes instance's HTTP API lives |
| `WHATSAPP_INTEGRATION_MODE` | `packages/whatsapp` adapter | `disabled` (default) / `shadow` / `live` |
| `RAZORPAY_INTEGRATION_MODE` | `packages/payments-and-wallet` adapter | `disabled` (default) / `shadow` / `live` |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | live-mode Razorpay adapter only | Never read outside the `mode === "live"` branch |
| `BYOK_VAULT_ENCRYPTION_KEY` | `packages/byok` | 32-byte hex AES-256-GCM key for the dev secret vault |
| `DRIVE_OAUTH_STATE_SECRET` | `packages/storage` | Signs the Drive OAuth CSRF state parameter |
| `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` | `packages/storage` Drive adapter | Google OAuth app credentials |
| `WHATSAPP_APP_SECRET` / `WHATSAPP_TOKEN` / `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_GRAPH_API_VERSION` | `apps/whatsapp-worker`, `packages/whatsapp` | Meta WhatsApp Cloud API (pre-existing names, reused) |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | every new package's `createServiceClient()` | Already-existing project convention, reused as-is |
| `PORT` | `apps/whatsapp-worker`, `apps/hermes-gateway` | HTTP listen port (has a default) |
| `MISSION_WORKER_POLL_INTERVAL_MS`, `MISSION_WORKER_BATCH_SIZE`, `WHATSAPP_PROCESSOR_POLL_INTERVAL_MS` | respective workers | Optional tuning, all have defaults |

Removed this session: `WHATSAPP_WORKER_DEFAULT_TENANT_ID` — introduced in an earlier checkpoint as a placeholder before phone-to-tenant routing existed, superseded by `whatsapp_phone_bindings` and deleted once real routing was built. Not something to set.

## Callback / webhook URLs (paths only — exact domain depends on `MANUAL_SETUP_REQUIRED.md` M1)

| Path | Registered with | Status |
|---|---|---|
| `/api/platform/storage/drive/callback` | Google OAuth app | Not registered — code ready, needs M7 |
| `<whatsapp-worker host>/webhook` | Meta WhatsApp Cloud API | Not registered — `apps/whatsapp-worker` isn't deployed anywhere yet (M11) |
| `<hermes-gateway host>/tools/:toolName` | A running Hermes instance's tool-calling config | Not registered — neither side exists live yet |
| Existing Meta/Google/Razorpay callbacks for the Social Autopilot and legacy systems | Unchanged | Not touched this session |

## Manual actions that produce these values

See `MANUAL_SETUP_REQUIRED.md` — items M4 through M9 cover every row above that isn't already configured from prior work.
