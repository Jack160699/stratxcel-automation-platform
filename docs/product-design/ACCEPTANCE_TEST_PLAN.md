# Acceptance Test Plan

Design documentation only — the criteria a future implementation phase (`IMPLEMENTATION_PHASES.md`) must satisfy before it can be considered done. No tests were written or run to produce this document; it defines what future automated and manual tests should check.

## 1. Design-token conformance

- [ ] `app/globals.css` contains exactly one `--sx-*` namespace (the collision described in `DESIGN_SOURCE_AUDIT.md` §4 is resolved, not merged).
- [ ] Automated lint rule (or a CI grep, at minimum) fails a PR that introduces `bg-slate-*`, `text-slate-*`, `border-slate-*`, `bg-gray-*`, or raw hex colors inside `/admin`, `/app`, or shared shell components — the enforceable version of "do not approve raw slate-* styling."
- [ ] Every colour used in `/app` and `/admin` traces to a token in `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` — spot-checked visually against the reference HTML document's rendered sections, not just the token names.
- [ ] Instrument Sans renders for all UI text, JetBrains Mono renders for all IDs/timestamps/metrics, in both `/admin` and `/app` (font-loading regression is otherwise invisible until a font 404s in production).

## 2. Route & redirect correctness

- [ ] Every route in `ROUTE_AND_REDIRECT_MAP.md` §1 resolves (200 for existing content, or the correct redirect).
- [ ] Each of the 6 identities in `ROLE_AND_PERMISSION_EXPERIENCE.md` §3 lands exactly where the decision table says, tested with real accounts in each state (visitor, fresh signup, invited-not-yet-accepted, client member, staff-only, staff-with-membership).
- [ ] A client session requesting any `/admin/*` URL gets the same treatment as a nonexistent route — verified by inspecting the actual response, not just the visible page (this branch's own RSC-disclosure precedent means "looks right" is not sufficient — check the flight-data payload too, exactly as done for the `/admin/platform` hotfix earlier in this session).
- [ ] A staff-only session requesting `/app/*` directly is redirected to `/admin`, no error page shown.
- [ ] The `stratxcel_active_tenant` cookie continues to behave exactly as today (membership-re-verified every read, stale-cookie fallback to first membership) — regression-tested against the existing `unified-shell-tenant-ux.test.ts` pattern, extended rather than replaced.

## 3. Permission conformance

- [ ] For each `TenantRole` (`owner`/`admin`/`operator`/`viewer`), every nav item and page action in `PAGE_BY_PAGE_SPECIFICATIONS.md` matches the permission table in `ROLE_AND_PERMISSION_EXPERIENCE.md` §2 exactly — a scripted check (role × permission × expected-visible-nav-items) is preferable to manual spot-checking given the number of combinations.
- [ ] No page ever leaks data to a role that can view-but-not-act beyond what `EMPTY_LOADING_ERROR_STATE_MATRIX.md` §4 specifies as intentional.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`-unset build/test still passes after every phase that touches `/admin` or `/app` — this is the specific regression class this branch fixed earlier and must not silently reappear as new pages are added; re-run the exact check used for the earlier fix (`npm run build` with the var explicitly unset).

## 4. Shell & interaction conformance

- [ ] Sidebar: every state transition in `SIDEBAR_INTERACTION_SPECIFICATION.md` §1–6 verified manually (hover expand/collapse, pin persistence across reload, keyboard focus expand, tooltip-on-collapsed, active-route accent treatment) at each of the three breakpoint tiers (desktop/tablet/mobile) in `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §1.
- [ ] Context panel: pinned at ≥1440px, overlay at 1280–1439px, sheet/tab below 768px — verified at real viewport widths, not just resized-desktop simulation, on at least one real mobile device.
- [ ] `StaffContextBadge` appears if and only if a staff member is inside a client workspace via the explicit "View client workspace" action — never appears for a genuine client session, never fails to appear when it should (both directions tested, since either failure is a trust problem).

## 5. AI visual language conformance

- [ ] Every one of the 8 AI states in `DESIGN_SOURCE_AUDIT.md` §2.7 renders with its specified dot colour/motion in at least one real screen (Copilot, a running mission).
- [ ] No AI-related UI anywhere uses a face, sparkle, or mascot graphic — this is a design-review checklist item, not something automatable, but should be an explicit sign-off step before any phase ships.
- [ ] Confidence bar correctly triggers the "requires review" state below 0.60 wherever it's used.
- [ ] At most one AI-active card renders per view — a scripted or manual check on Command Center/Copilot screens with multiple concurrent missions.

## 6. Accessibility conformance

- [ ] Automated contrast check (e.g. axe or equivalent) passes for text-primary/secondary/tertiary against `--sx-bg` and `--sx-surface-*` at the exact ratios stated in `DESIGN_SOURCE_AUDIT.md` §2.16.
- [ ] 2px accent focus ring visible via keyboard `Tab` on every interactive element in a sampled set of pages, including cards (not just buttons/inputs).
- [ ] Every status chip pair-tested with colour vision deficiency simulation to confirm shape (not just colour) is sufficient to distinguish states.
- [ ] All interactive touch targets ≥44px measured on an actual mobile viewport for at least the bottom tab bar and one representative list page.
- [ ] `prefers-reduced-motion: reduce` verified to disable pulse/shimmer/sweep animations without breaking layout.

## 7. Content/voice conformance

- [ ] Sample of error messages across `/app` and `/admin` checked against the "what happened / what it affects / what to do" pattern in `CONTENT_AND_UX_VOICE.md` §2 — a copy-review pass, not automatable.
- [ ] No hype language (`CONTENT_AND_UX_VOICE.md`'s explicit forbidden example) present anywhere inside `/app` or `/admin` product surfaces.
- [ ] Every empty state in `EMPTY_LOADING_ERROR_STATE_MATRIX.md` §2 matches its specified copy, or a deliberate, reviewed deviation.

## 8. What this plan does not include

Performance budgets, SEO acceptance criteria for the public site, and cross-browser matrices are not specified here — they're standard engineering acceptance criteria orthogonal to this design package and should be added by whoever owns implementation, not invented here as design opinion.
