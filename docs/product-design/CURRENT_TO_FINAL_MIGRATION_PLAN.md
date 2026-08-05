# Current → Final Migration Plan

Design documentation only — describes what implementation will eventually need to do, in what order, to reduce risk. No code, routes, or config were changed to produce this. Sequencing/phasing of the actual build work is in `IMPLEMENTATION_PHASES.md`; this document is the route/component-level mapping that phasing plan executes against.

## 1. Route-by-route disposition

| Current route | Final disposition |
|---|---|
| `app/page.tsx` (`/`) | Re-skinned onto design tokens; content/sections restructured per `PUBLIC_WEBSITE_SITEMAP.md` Home. The WebGL "journey" experience is a separate decision — see §4. |
| `app/(marketing)/modules` | Kept, retitled "Products" in nav copy only (route can stay `/modules` or 301 to a new path — no functional reason to force a URL change). |
| `app/(marketing)/use-cases` | Kept, retitled "Solutions" in nav copy only. |
| `app/(marketing)/social-autopilot`, `/agents`, `/pricing`, `/contact` | Kept, re-skinned. |
| `app/(marketing)/system` | Inventory during implementation — purpose unclear from routing alone in this pass; not referenced by any current nav I found. |
| `app/(marketing)/privacy`, `/terms`, `/data-deletion` | Unchanged — legal pages, content untouched, only visual re-skin. |
| **New public routes** (`/security`, `/about`, `/how-it-works`, `/work`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/invite/{token}`) | Net-new, per `ROUTE_AND_REDIRECT_MAP.md` §1. |
| `app/admin/(shell)/*` (Command Center, tenant switcher, platform/missions/approvals/wallet/queue/whatsapp/tenants) | **Reused, not rebuilt.** Every data call (`listMissionsForTenant`, `listPendingApprovals`, `getWalletAccount`, `createPostgresQueueAdapter`, `listPhoneBindingsForTenant`, `listMembershipsForUser`) and the entire auth/RLS layer fixed earlier in this branch stays exactly as-is. Only the presentation layer (Tailwind classes, layout structure) and the route paths (`/admin/platform/missions` → `/admin/missions`, etc., per `ADMIN_INFORMATION_ARCHITECTURE.md` §1) change. |
| `app/admin/social/*` | **Untouched in this phase.** Its own shell, its own auth gate, its own theme file stay exactly as they are. See §3 for the longer-term question. |
| `app/admin/reset-password` | Stays as the staff-scoped reset flow; the new public `/reset-password` is a separate, client-facing route — not a replacement. |
| **New `/app/*` routes** | Entirely new, per `CLIENT_APP_INFORMATION_ARCHITECTURE.md`. |

## 2. Component-by-component disposition

| Current component | Disposition |
|---|---|
| `app/admin/(shell)/AppShell.tsx` | Becomes the seed for the new shared `Sidebar`/`TopCommandBar`/`ContextPanel` set (`COMPONENT_INVENTORY.md`) — its structure (auth-gated shell wrapping children) is correct, its styling and interaction model (no hover-expand sidebar today) need the rework specified in `SIDEBAR_INTERACTION_SPECIFICATION.md`. |
| `app/admin/(shell)/ClientSwitcher.tsx`, `CurrentTenantContext.tsx`, `tenant-actions.ts` | Reused as-is at the data/logic layer (this is exactly the code fixed for the service-role defect earlier in this branch) — only the switcher's visual presentation changes to match the top-command-bar spec. |
| `app/admin/social/SocialShell.tsx`, `nav.ts`, `social-theme.css` | Unchanged in this phase (§3). |
| `app/globals.css`'s existing `--sx-*` block | **Replaced**, not merged — see `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` §1. This is the single highest-blast-radius change in the whole migration, since it's a global stylesheet, and needs to happen first (§5) before any page-level re-skinning, or every subsequent PR fights the old tokens. |
| Raw `slate-*`/`gray-*` Tailwind utility usage throughout `/admin/(shell)/*` | Replaced with `--sx-*`-backed utilities per `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` §6, page by page. |
| `Geist`/`Geist_Mono` font loading in `app/layout.tsx` | Replaced with `Instrument_Sans`/`JetBrains_Mono` per `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` §7. |

## 3. Open question: does `/admin/social` ever fold into the shared shell?

This design pass does not answer this — it's explicitly out of scope per the brief's framing (Social Autopilot is called out as "production-working" in the existing Command Center copy, and the brief's shared-shell requirement lists `/app` and `/admin` pages, not a rebuild of Social Autopilot specifically). Two real options for a future phase:
- **(A)** Social Autopilot's pages (Analytics, Automations, Brand, Copilot, Create, Inbox, Integrations, Planner, Settings, System) become the literal implementation of `/app`'s Content cluster + `/app/automations` + `/app/brand`, retiring `SocialShell.tsx` in favor of the shared shell once `/app` exists.
- **(B)** Social Autopilot keeps its own shell indefinitely as a specialized workspace, and `/app`'s Content cluster becomes a *new* build that happens to cover similar ground.

(A) is clearly cheaper and more consistent with "one product, not two," and every page-purpose description in `PAGE_BY_PAGE_SPECIFICATIONS.md`'s Content cluster explicitly notes it's "generalized from" the equivalent Social Autopilot page for exactly this reason — but committing to retiring a production-working shell is a business decision, not a design one, and is listed again in the final report's "decisions requiring business approval."

## 4. Open question: what happens to the marketing "journey" experience

The current home page is an immersive, cursor-hidden, WebGL-backed experience (`app/_experience`, `sx-journey`/`sx-glass`/`sx-grain` classes in `app/globals.css`) that is visually and technically unrelated to the approved design system. Re-skinning `/` per `PUBLIC_WEBSITE_SITEMAP.md` most likely means **replacing** this experience with the flatter, token-driven marketing layout described there, not layering new tokens onto the existing WebGL scene. Whether any part of the "journey" concept (the interactive canvas, the press-start pulse) is worth preserving as a *component* inside the new homepage's hero section, versus retired outright, is a genuine design taste call for the business — flagged, not decided, here.

## 5. Sequencing (what must happen before what)

1. Token foundation: replace `app/globals.css`'s `--sx-*` block, swap fonts. Nothing else can be re-skinned cleanly before this lands, since every subsequent page would otherwise be built against tokens about to change again.
2. Shared shell components (`Sidebar`, `TopCommandBar`, `ContextPanel`) built once, against the new tokens.
3. `/admin/(shell)` re-skinned onto the shared shell + new tokens (lowest risk — smallest page count, already has correct data-layer code, security-hardened this session).
4. `/app` built new, reusing the same shared shell + reused server-side data functions where they already exist (missions, approvals, wallet, tenants) and net-new work where they don't (Website & SEO, Ads, the agency-level Leads distinction).
5. Public site re-skin, in parallel with step 4 since it shares no components with `/app`/`/admin`.
6. `/admin/social` — no action this phase, revisit per §3 once `/app`'s Content cluster is real and a fold-in decision has been made.

Full phased delivery breakdown (branches, review gates, what ships to Production when) is `IMPLEMENTATION_PHASES.md`.
