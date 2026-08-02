# Data Migration Report

## No production data was migrated

No Supabase project reachable from this session holds real StratExcel or `ai-automation-system` data (see `docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md`), so there was nothing to migrate data *out of* — every table introduced this session is new and empty, defined only as migration files, never applied anywhere (see `MANUAL_SETUP_REQUIRED.md` M10).

## Code migration within this repo (Phase 3 restructuring)

Moved from `lib/*` (app-internal) into standalone npm workspace packages so `apps/whatsapp-worker`, `apps/mission-worker`, and `apps/hermes-gateway` could depend on them without pulling in the Next.js dashboard app:

| From | To |
|---|---|
| `lib/audit/*` | `packages/audit/src/*` |
| `lib/wallet/*`, `lib/integrations/razorpay/*` | `packages/payments-and-wallet/src/{wallet,razorpay}/*` |
| `lib/crm/*` | `packages/leads-and-crm/src/*` |
| `lib/missions/*`, `lib/service-catalogue/*` | `packages/missions/src/*` |
| `lib/approvals/*` | `packages/approvals/src/*` |
| `lib/integrations/whatsapp/*` | `packages/whatsapp/src/*` |
| `lib/brand-brain/*` | `packages/brand-brain/src/*` |
| `lib/human-handoff/*` | `packages/human-handoff/src/*` |

Each move preserved the original logic (git shows these as renames, not rewrites, where the code itself didn't change) and each package gained its own tiny Supabase service-client factory rather than importing the app's `lib/supabase/service.ts` — deliberate duplication (~10 lines × 9 packages) so packages never depend backwards on the app.

## No business logic was ported from `ai-automation-system` wholesale

Per your instruction ("do not blindly translate every Python or Node file"), nothing was copied line-by-line from the legacy repo. What exists instead:

- **WhatsApp:** a new, independent implementation (`packages/whatsapp/src/conversation/`) covering opt-out detection, lead creation, and service-classification-driven response drafting — real logic, not a port. See `WHATSAPP_PARITY_REPORT.md` for exactly which legacy capabilities this does and doesn't cover.
- **Razorpay:** a new payment state machine, idempotent webhook storage, and refunds model (`packages/payments-and-wallet/src/razorpay/`) — designed against Razorpay's own documented webhook shape, not the legacy code's specific implementation, since the two legacy routes discovered in `ai-automation-system` were not deeply inspected line-by-line this session.
- **CRM/leads:** basic create/find-by-phone/update-status (`packages/leads-and-crm`) — a small subset of what `ai-automation-system/backend/app/leads/` likely does; no lead-scoring, pipeline stages, or follow-up scheduling ported.

## Jan Darpan

Not touched. No Jan Darpan table, project, or code was read, queried, or modified this session beyond confirming its identity in Phase 1 discovery.
