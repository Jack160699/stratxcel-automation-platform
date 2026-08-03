# Implementation Phases

Design documentation only — a recommended sequencing for the build work this package specifies. No implementation has started; this is the plan for a future, separate, explicitly-authorized effort, following the same phase-gated, security-first discipline already established earlier in this branch (small reviewable diffs, feature branches, no direct-to-`main`, Preview-tested before any merge).

## Phase A — Token foundation (small, high-leverage, must land first)
- Replace `app/globals.css`'s `--sx-*` block per `DESIGN_TOKEN_IMPLEMENTATION_MAP.md`.
- Swap `Geist`/`Geist Mono` for `Instrument Sans`/`JetBrains Mono` in `app/layout.tsx`.
- No page content changes yet — this phase is invisible in production until later phases consume the tokens, but it's a global CSS change and gets its own review/Preview cycle given the blast radius.
- **Exit criteria**: build succeeds, both marketing and `/admin` render without visual breakage under the *old* class names still in place (tokens exist, nothing consumes them yet), no visual regression in what's live today.

## Phase B — Shared shell components
- Build `Sidebar`, `TopCommandBar`, `ContextPanel`, and the base `Chip`/`PulseDot`/`Card` primitives from `COMPONENT_INVENTORY.md`, styled against Phase A's tokens.
- Built and reviewed in isolation (e.g. behind a private route or Storybook-equivalent), not yet wired into `/admin` or `/app`.
- **Exit criteria**: every state in `SIDEBAR_INTERACTION_SPECIFICATION.md` (collapsed/expanded/pinned/keyboard) and `SHARED_SHELL_SPECIFICATION.md` demonstrably works before any real page depends on it.

## Phase C — `/admin` re-skin (lowest risk, reuses proven data layer)
- Re-skin `app/admin/(shell)/*` onto Phase B's shell + Phase A's tokens.
- Route renames per `ADMIN_INFORMATION_ARCHITECTURE.md` §1 (`platform/tenants` → `clients`, etc.) — with redirects from old paths, since these routes may already be bookmarked by staff.
- New pages with no current equivalent (Human Handoffs, Leads, System Health, Audit Log) built last within this phase, after the re-skin of existing pages proves the shell out.
- Every data call stays exactly as fixed in this branch's earlier security work — this phase is presentation and routing only, and should explicitly re-run the same regression tests already written for the service-role fix to confirm nothing there regresses.
- **Exit criteria**: `/admin` fully on the new design system, Preview-tested by an authenticated owner exactly as the prior phase's hotfix was, before merge.

## Phase D — `/app` net-new build
- Sequence within the phase, cheapest/most-proven first: Command Center + Copilot + Missions + Approvals (all reuse existing server functions) → Content cluster (generalize from Social Autopilot per `CURRENT_TO_FINAL_MIGRATION_PLAN.md` §3, decision pending) → Billing/Team/Settings (reuse wallet/tenant-membership functions) → Growth cluster (Website & SEO, Ads, CRM/Conversations — genuinely new, budget accordingly).
- Auth/onboarding/redirect-table build (`AUTH_AND_ONBOARDING_FLOW.md`, `ROUTE_AND_REDIRECT_MAP.md`) happens at the start of this phase, since nothing in `/app` is reachable without it.
- **Exit criteria**: a brand-new signup can complete onboarding and reach a working Command Center; an invited member can accept and land correctly; role-based nav hiding demonstrably works for all four `TenantRole`s.

## Phase E — Public site re-skin
- Can run in parallel with Phase D (shares no components).
- New pages (`/security`, `/about`, `/how-it-works`, `/work`) content-authored alongside the visual re-skin — content doesn't exist yet for these, so this phase includes copywriting, not just layout.
- Decision on the WebGL "journey" experience (`CURRENT_TO_FINAL_MIGRATION_PLAN.md` §4) needs to land before this phase starts, not during it.

## Phase F — Staff-in-client-workspace + agency-wide framing polish
- The `StaffContextBadge` mechanism, `/admin/clients/{id}`'s "View client workspace" action, and Finance/All-Missions/Approvals' agency-wide-vs-tenant-scoped naming convention — these depend on both Phase C (`/admin`) and Phase D (`/app`) being real, so they're sequenced last even though they're conceptually part of both.

## Cross-cutting, every phase
- Every phase ends with a Preview deployment and authenticated review before merge, following the exact procedure already proven twice in this branch's history (public-key-extraction for Preview env, unauthenticated route testing, then owner handoff) — no phase merges to `main` or deploys Production without that cycle.
- Every phase that touches an existing route re-runs the existing regression suites (`test:security`, `test:foundation`, the service-role-unset build check) — visual work must not silently reintroduce a fixed defect.
- No phase in this plan touches Supabase schema, RLS policies, environment variables, or worker/integration configuration — everything specified in this design package is achievable as application code and content changes against the data model that already exists today. If an implementer discovers a genuine schema gap (the invitation-pending-state question in `ROLE_AND_PERMISSION_EXPERIENCE.md` §5 is the one already flagged), that becomes its own explicitly-scoped, explicitly-authorized task — not something folded silently into a "design implementation" phase.

## What is not phased here

Actual engineering estimates (days/weeks per phase) are not provided — this is a dependency-ordered sequence, not a timeline, since effort sizing depends on team capacity this document has no visibility into.
