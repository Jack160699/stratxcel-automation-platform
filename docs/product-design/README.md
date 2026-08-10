# Stratxcel Product Design Package

Design and product-architecture documentation only. **No application code, migrations, environment variables, integrations, or workers were changed to produce this package**, and nothing in it has been merged, deployed, or wired to Production. It was produced on `feat/unified-command-center-phase-1` alongside (but independent of) that branch's already-shipped service-role fix; nothing here depends on that fix or vice versa.

## What problem this solves

The current product is three visually and structurally disconnected surfaces: a marketing site with its own WebGL "journey" aesthetic, a new unified `/admin` shell styled in raw Tailwind slate utilities, and `/admin/social` (Social Autopilot) with its own independent shell. There is no client-facing workspace at all — clients would have to use `/admin`, which the business does not want. This package designs the fix: one design system (`--sx-*` tokens, Instrument Sans/JetBrains Mono, dark canvas), one shared shell component used by both the new client workspace (`/app`) and internal operations (`/admin`), and a role-based redirect model that keeps clients out of `/admin` entirely.

## Source of truth

The approved visual language comes from a single HTML document provided in-conversation (referred to in the task as a "zip," but no zip file exists on disk — see `DESIGN_SOURCE_AUDIT.md` §1 for the full discrepancy note). That document was read in full, not just its thumbnail, and every token, component spec, and behavioral rule in this package traces back to it.

## Reading order

**Start here if you're reviewing for business sign-off:**
1. `DESIGN_SOURCE_AUDIT.md` — what the approved system actually says, and exactly how far today's product is from it.
2. `ROLE_AND_PERMISSION_EXPERIENCE.md` — who sees what, grounded in the real, already-implemented role model (not invented).
3. `CURRENT_TO_FINAL_MIGRATION_PLAN.md` §3–4 — the two genuine open decisions this package could not resolve on its own (whether Social Autopilot eventually folds into the shared shell; what happens to the WebGL homepage experience).

**Start here if you're about to implement:**
1. `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` — the exact tokens, ready to paste into `app/globals.css`.
2. `SHARED_SHELL_SPECIFICATION.md` + `SIDEBAR_INTERACTION_SPECIFICATION.md` + `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` — the one shell component both `/app` and `/admin` consume.
3. `COMPONENT_INVENTORY.md` — every reusable primitive, cross-referenced to its design-system source section.
4. `ROUTE_AND_REDIRECT_MAP.md` + `AUTH_AND_ONBOARDING_FLOW.md` — the identity/redirect layer that has to exist before any page is reachable correctly.
5. `CLIENT_APP_INFORMATION_ARCHITECTURE.md` + `ADMIN_INFORMATION_ARCHITECTURE.md` + `V1_STABLE_BETA_RELEASE_CONTRACT.md` + `PAGE_BY_PAGE_SPECIFICATIONS.md` — what to actually build, page by page, including Stable vs Beta release boundaries.
6. `EMPTY_LOADING_ERROR_STATE_MATRIX.md` + `CONTENT_AND_UX_VOICE.md` — how every state and every sentence should read.
7. `IMPLEMENTATION_PHASES.md` — the recommended build order.
8. `ACCEPTANCE_TEST_PLAN.md` — how to know each phase is actually done.

## Full index

| # | Document | Covers |
|---|---|---|
| 1 | `DESIGN_SOURCE_AUDIT.md` | Complete extraction of the approved design system + gap analysis against every current surface |
| 2 | `ROLE_AND_PERMISSION_EXPERIENCE.md` | The real role model, mapped to public/`/app`/`/admin`, six identities, staff-in-client-workspace |
| 3 | `PUBLIC_WEBSITE_SITEMAP.md` | Every public page: purpose, sections, CTAs, states |
| 4 | `AUTH_AND_ONBOARDING_FLOW.md` | Login, signup, 6-step onboarding, invitation acceptance |
| 5 | `CLIENT_APP_INFORMATION_ARCHITECTURE.md` | `/app` nav grouping, Command Center, Copilot/Missions relationship, content cluster |
| 6 | `ADMIN_INFORMATION_ARCHITECTURE.md` | `/admin` nav grouping, agency-wide vs. tenant-scoped naming convention |
| 7 | `ROUTE_AND_REDIRECT_MAP.md` | Every route, every redirect rule, literal decision table |
| 8 | `SHARED_SHELL_SPECIFICATION.md` | The four-region shell both `/app` and `/admin` share |
| 9 | `SIDEBAR_INTERACTION_SPECIFICATION.md` | Collapsed/expanded/pinned states, keyboard behavior |
| 10 | `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` | Every breakpoint's behavior, bottom tab bar, sheets |
| 11 | `PAGE_BY_PAGE_SPECIFICATIONS.md` | Every `/app` and `/admin` page in detail |
| 12 | `COMPONENT_INVENTORY.md` | Every reusable component, states, design-system reference |
| 13 | `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` | The exact `--sx-*` token values + Tailwind v4 mapping |
| 14 | `CONTENT_AND_UX_VOICE.md` | Voice rules, extended to public/onboarding/admin |
| 15 | `EMPTY_LOADING_ERROR_STATE_MATRIX.md` | Systematic empty/loading/error/permission states with copy |
| 16 | `CURRENT_TO_FINAL_MIGRATION_PLAN.md` | Route-by-route, component-by-component disposition |
| 17 | `IMPLEMENTATION_PHASES.md` | Recommended build sequence (A–F) |
| 18 | `ACCEPTANCE_TEST_PLAN.md` | Done-criteria for every phase |

## Visual boards

Static, non-production visual boards (desktop + mobile) demonstrating the system are published as a private Claude Artifact, not deployed to Production and not wired to any API — see the final report delivered alongside this package for the link. They cover: public homepage, login, signup, onboarding, Client Command Center, Copilot, Mission detail, Approvals, Content overview, CRM, mobile Command Center, mobile Copilot, internal Agency Overview, Client list, and Operations Queue.

## What has not happened

No `/app` route exists. No `/admin` page has been re-skinned. No token has been added to `app/globals.css`. `main` is untouched. Production is untouched. No migration, environment variable, or integration was modified. This package is the plan; `IMPLEMENTATION_PHASES.md` is where the actual building starts, on explicit future authorization.
