# Repository Capability Matrix

Which repository actually contains each capability the brief asks StratExcel AI to have, based on direct code inspection (not documentation claims). `ai-automation-system` was inspected via a local read-only shallow clone; nothing was pushed to it or modified in it.

| Capability | `stratxcel-automation-platform` (this repo) | `ai-automation-system` |
|---|---|---|
| Marketing/corporate site | Yes — 3D/GSAP experience site (`app/_experience`, `app/(marketing)`) | Yes — `apps/main-site`, `apps/ai-marketing` |
| Meta (Facebook/Instagram) publishing | Yes — `lib/social/providers/facebook.ts`, `instagram.ts`, OAuth routes under `app/api/social/oauth` | Not found |
| Threads publishing | Yes — `lib/social/providers/threads.ts` | Not found |
| LinkedIn | Provider adapter exists (`lib/social/providers/linkedin.ts`); connection/review status unconfirmed | Not found |
| YouTube / Google OAuth | Yes, active work-in-progress — `lib/social/providers/youtube.ts`, `youtube-visibility.ts`, uncommitted `CLAUDE_YOUTUBE_PRIVACY_HANDOFF.md` and test file | Not found |
| Social "Copilot" / agent runtime | Yes — `app/admin/social/copilot/*`, `app/api/social/copilot/*`, `lib/social/agent/*` (orchestrator, tools, telemetry) | A different, unrelated "copilot" — `lib/copilotEngine.js` / `copilotSuggestions.js` in `apps/ai-os` (sales-suggestion engine, not a publishing agent) |
| WhatsApp Business bot | **Not found** (only WhatsApp *contact links* in marketing copy) | **Yes** — `backend/app/whatsapp/` (Flask; submodules for admin, brain, memory, roles, sales, tests, utils) |
| Razorpay payments | **Not found** | **Yes**, and extensively — `apps/ai-os/lib/payments/razorpay.js`, `apps/ai-os/app/api/webhook/razorpay`, `apps/stratxcel-os/lib/revenue/razorpay.ts`, `backend/app/payments/`, `backend/payments/razorpay.js`, `packages/payments/` |
| CRM / lead management | Light — `app/admin/LeadAnalytics.tsx` (analytics view only) | Yes — `backend/app/leads/`, `backend/app/sales/`, `apps/stratxcel-os/components/os/inbox-view.tsx` |
| Admin/operator workspace | Yes — `app/admin/social/*` (social-focused) | Yes — `apps/ai-os/app/admin/*`, `apps/stratxcel-os` "OS" console (payments, inbox) |
| Supabase-backed data layer | Yes — `lib/social/repositories/*`, own migrations directory, dedicated project `uccqlgeghkwzujeeymua` | Yes — `backend/supabase/migrations/` (separate migration history, unconfirmed which Supabase project it targets) |
| Shared packages | None (single Next.js app) | `packages/payments`, `packages/ui`, `packages/config`, `packages/auth` (real turborepo workspace boundaries already exist) |

## Reading

These two repositories are not two versions of the same product — they are **two different halves of what the brief describes as "StratExcel AI"**, built and last touched at different times:

- `stratxcel-automation-platform` is where **current, active engineering effort** is going (commits as recent as yesterday) and owns the **Social Autopilot** (Meta/Threads/YouTube publishing + agent Copilot) and the dedicated, properly-separated-from-Jan-Darpan Supabase project.
- `ai-automation-system` is where the **WhatsApp bot, Razorpay billing, and CRM/sales/lead logic** actually live, last touched 2026-05-28, and — per [SYSTEM_INVENTORY.md](SYSTEM_INVENTORY.md) — **is still deployed and serving live production traffic on `app.stratxcel.in`** despite being unmaintained for over two months.

The brief's stated "preferred canonical candidate" (`stratxcel-automation-platform`) does not contain the WhatsApp/Razorpay/CRM systems the brief also says must be preserved. Treating one repo as simply "canonical" and the other as "legacy to archive" would either strand a live, revenue-relevant production system (`app.stratxcel.in`) or abandon the actively-developed Social Autopilot. This needs an explicit decision — see the canonical-architecture question raised back to the product owner alongside this discovery.
