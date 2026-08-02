# OAuth / Webhook / Callback Map

Route paths and environment variable **names** only — no secret values were read or recorded anywhere in this document.

## `stratxcel-automation-platform` — Social Autopilot (Meta / Threads / YouTube / LinkedIn)

| Route | Purpose |
|---|---|
| `app/api/social/oauth/[provider]/connect/route.ts` | Starts OAuth for a given provider (`facebook`, `instagram`, `threads`, `youtube`, `linkedin` per `lib/social/providers/`) |
| `app/api/social/oauth/[provider]/callback/route.ts` | OAuth callback / token exchange |
| `app/api/social/webhooks/[provider]/route.ts` | Inbound platform webhooks (Meta webhook verification + delivery) |
| `app/api/social/worker/route.ts` | Cron-triggered publish/automation worker (guarded by `CRON_SECRET`) |
| `app/api/social/copilot/*` | Agent/Copilot runtime endpoints (not OAuth-facing) |

Env vars referenced (names only): `META_APP_ID`, `META_APP_SECRET`, `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_APP_SECRET`, `META_THREADS_APP_ID`, `META_THREADS_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `SOCIAL_OAUTH_STATE_SECRET`, `SOCIAL_TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`.

No YouTube- or LinkedIn-specific app credentials appear in `.env.example` yet, consistent with the in-progress, uncommitted `CLAUDE_YOUTUBE_PRIVACY_HANDOFF.md` in this repo — YouTube/Google verification is unfinished.

Callback URLs themselves (the actual `https://.../api/social/oauth/.../callback` values registered with Meta/Google) were not extracted — they depend on which of `stratxcel` vs `stratxcel-site` is the live domain (see [VERCEL_DOMAIN_DEPLOYMENT_MAP.md](VERCEL_DOMAIN_DEPLOYMENT_MAP.md)), which must be resolved before any callback URL is treated as authoritative.

## `ai-automation-system` — WhatsApp / Razorpay

| Route | Runtime | Purpose |
|---|---|---|
| `backend/app/whatsapp/webhook.py` — Flask routes `GET/POST /webhook` | Python/Flask | Meta WhatsApp Cloud API verification (`GET`) and inbound message delivery (`POST`) |
| `backend/routes/webhook.js` | Node backend | Also references WhatsApp — relationship to the Flask route above (same logical webhook exposed two ways, or two separate integrations) was not resolved in this pass |
| `apps/ai-os/app/api/webhook/razorpay/route.js` | Next.js (`ai-os`) | Razorpay payment webhook |
| `apps/stratxcel-os/app/api/webhooks/razorpay/route.ts` | Next.js (`stratxcel-os`) | A second, separate Razorpay webhook route in a different app within the same monorepo |
| `apps/ai-os/app/api/create-order/route.js`, `apps/ai-os/app/api/payments/create-link/route.js` | Next.js | Razorpay order/payment-link creation |

Env vars referenced (names only): `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_TEST_TO`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_LIVE_KEY_ID`, `RAZORPAY_LIVE_KEY_SECRET`, `RAZORPAY_LIVE_WEBHOOK_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_LIVE_KEY_ID`, `INTERNAL_PAYMENT_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Important:** separate `TEST` and `LIVE` Razorpay key pairs already exist in this codebase — good existing hygiene, and the reason any Razorpay testing during migration can use the test pair without going near live payment flows.

## The WhatsApp bot is very likely not running on Vercel at all

`ecosystem.ai-os.cjs` (a PM2 process file) references `cwd: "/opt/ai-os/apps/ai-os"` for the frontend, and the README's deployment section says the Flask backend runs via **EC2 / systemd** (`backend/deploy.sh`, `backend/ai-os.service`, `backend/nginx.conf`) or optionally Docker — not Vercel. The presence of `RAILWAY_ENVIRONMENT`, `FLY_APP_NAME`, `RENDER`, `GCP_PROJECT`, `DYNO` env-var checks in the Python code suggests the backend has been portable across several hosts historically, but the README's current instructions point at a VPS/EC2 with systemd as the live setup.

**This means:** the actual running WhatsApp bot process — the thing that must keep working through this migration — lives on infrastructure this session has no visibility into (no SSH/EC2/Railway/Fly/Render MCP connector available). Its current host, uptime, and health cannot be verified from here. This is flagged as the top item in the Risk Register and as a required manual/owner-verification action.
