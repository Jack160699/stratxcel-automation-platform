# Vercel / Domain Deployment Map

Verified live via Vercel MCP tools (`list_teams`, `list_projects`, `get_project`), 2026-08-03. Team: `jack160699's projects` (`team_UWCzHaOLdAOtezWqRxYNxdYf`).

## Domain ownership as it stands today

| Domain | Owning Vercel project | Backing repo | Last deploy | Status |
|---|---|---|---|---|
| `stratxcel.in`, `www.stratxcel.in` | **`stratxcel`** AND **`stratxcel-site`** (both) | `stratxcel-automation-platform` | `stratxcel`: 2026-08-02 · `stratxcel-site`: 2026-07-24 | **Conflict.** Two projects both list these domains. Vercel only actually serves one per apex/subdomain at a time (whichever has the domain "verified" rather than merely "assigned" on that project) — which one is currently live in the browser was not checked from this session (no HTTP access) and must be confirmed in the Vercel dashboard. |
| `app.stratxcel.in` | `ai-os-ai-os` | `ai-automation-system` (unconfirmed which `apps/*` workspace is deployed) | 2026-05-28 | Live, stale. This is the deployment that currently answers for the WhatsApp/Razorpay/CRM system's web surface (not the WhatsApp bot itself — see [OAUTH_WEBHOOK_CALLBACK_MAP.md](OAUTH_WEBHOOK_CALLBACK_MAP.md) for why the bot process is likely not on Vercel at all). |
| *(none)* | `ai-os` | `ai-automation-system` | 2026-05-28 | Preview/vanity URL only (`ai-os-wine.vercel.app`), no custom domain attached. |
| *(none)* | `stratxcel-os` | `ai-automation-system` (`apps/stratxcel-os`) | 2026-05-16 | Preview/vanity URL only, no custom domain attached. |
| — | `newspaper-motion` | `jandarpan-ai-news-system` | — | Jan Darpan. Out of scope. |

## Resolution needed before any DNS or project changes

1. **Determine which of `stratxcel` / `stratxcel-site` is actually resolving `stratxcel.in` in production** (Vercel dashboard → Domains tab shows one as "Valid Configuration" and the other typically as a conflict warning). This cannot be determined via the MCP tools used in this session and needs a dashboard check by the account owner, or a live HTTP fetch to `stratxcel.in` with header inspection.
2. **Decide `stratxcel-site`'s fate** once (1) is known — likely the older/inactive of the pair, a candidate for archival once confirmed non-serving, never for deletion pre-emptively.
3. **`app.stratxcel.in` cutover is explicitly out of scope for now** per the approved migration sequence — it stays pointed at `ai-os-ai-os` unchanged until the migrated WhatsApp/Razorpay/CRM functionality reaches parity and passes shadow testing in the canonical repo.

No DNS records were read or changed as part of this discovery (DNS itself is outside Vercel's API surface reached here; only Vercel's own domain-assignment records were inspected).
