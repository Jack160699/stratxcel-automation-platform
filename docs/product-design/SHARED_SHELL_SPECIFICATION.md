# Shared Shell Specification

Design documentation only. This is the one shell used by both `/app` and `/admin` — the direct answer to "the current new admin shell and the existing Social Autopilot still look and behave like separate products." `/admin/social` is explicitly excluded from this shell in this phase (see `ADMIN_INFORMATION_ARCHITECTURE.md` §8 and `CURRENT_TO_FINAL_MIGRATION_PLAN.md`).

## 1. Four fixed regions

```
┌──────────┬──────────────────────────────────────────┐
│          │  Top command bar (56px)                   │
│ Sidebar  ├──────────────────────────────┬─────────────┤
│ 64/248px │  Primary workspace            │  Context    │
│          │  (max 1440px content)         │  panel      │
│          │                                │  320/380px  │
└──────────┴────────────────────────────────┴─────────────┘
```
Exact dimensions, breakpoints, radii, and spacing are the ones recorded verbatim in `DESIGN_SOURCE_AUDIT.md` §2.5 — not restated here to avoid drift between two copies of the same numbers.

## 2. Sidebar

Full interaction spec is its own document: `SIDEBAR_INTERACTION_SPECIFICATION.md`. Summary: 64px collapsed / 248px expanded, expands on hover and keyboard focus, collapses when pointer/focus leaves, 140ms ease-out, optional pin. Brand lockup ("sidebar/header" tier from `DESIGN_SOURCE_AUDIT.md` §2.1) sits at the top; profile/settings entry sits at the bottom, above the group described in §6 below.

**What differs between `/app` and `/admin`**: only the nav item list (`CLIENT_APP_INFORMATION_ARCHITECTURE.md` §1 vs. `ADMIN_INFORMATION_ARCHITECTURE.md` §1). The sidebar component itself — width, expand behavior, tooltip system, active-item treatment — is the same component, configured with a different item array. This is the mechanism that actually eliminates "two separate products": one `<Sidebar items={...} />`, not two hand-built shells.

## 3. Top command bar (56px)

Left to right:
1. **Current context** — in `/app`, the active client name + a switcher if the member belongs to >1 tenant (reuses the existing `stratxcel_active_tenant` cookie mechanism, `ROUTE_AND_REDIRECT_MAP.md` §2); in `/admin`, this slot instead shows "Agency Overview" or the current client being viewed if staff is inside a client-detail drill-down.
2. **Global search / Command-K** — search input with the `⌘K` hint chip exactly as specced in the design system's input examples (`DESIGN_SOURCE_AUDIT.md` §2.9).
3. **Agent status** — the AI pulse-dot + mono state line primitive (`DESIGN_SOURCE_AUDIT.md` §2.7), shown whenever Copilot or a mission is actively doing something; absent (not greyed-out, simply not rendered) when nothing is running, so its presence itself is meaningful.
4. **Notifications** — bell icon, unread-count badge, opens the notification-item list pattern from the design system (unread = colored dot + full-opacity row, read = 70% opacity).
5. **User menu** — avatar, opens: profile, settings link, `Sign out`. In `/admin`, when staff is inside a client workspace, this is where the **"Viewing as Stratxcel staff"** badge and "return to /admin" link live (`ROLE_AND_PERMISSION_EXPERIENCE.md` §6) — positioned immediately left of the user menu, accent-muted pill, mono label, always visible (not tucked inside a menu) since it's a trust-relevant state the client-shared components must surface plainly.

Secondary/overflow actions collapse into a `⋯` icon button below the 1280px breakpoint per `RESPONSIVE_AND_MOBILE_SPECIFICATION.md`.

## 4. Right context panel (320px / 380px)

Used for exactly the content types listed in `CLIENT_APP_INFORMATION_ARCHITECTURE.md` §7 on `/app`, and the equivalent "selected record" cases in `/admin` (a selected client in `/admin/clients`, a selected handoff in `/admin/handoffs`). Behavior:
- **≥1440px**: pinned, always visible, pushes workspace content to `max-width: 1440px − panel width` rather than overlapping it.
- **1280–1439px**: becomes an overlay (slides in from the right, `160ms` per motion rules, scrim behind it at the same opacity used for modals) rather than permanently reserving layout width.
- **<1280px** (tablet) and **mobile**: becomes a sheet/tab — see `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §3.
- Closing: explicit close control always present (not "click outside only," since the panel can contain multi-step content like an approval decision that shouldn't be dismissable by an accidental outside click).
- Content follows the "AI-active card: one thing at a time" discipline — the panel shows one selected record's detail, never a stacked list of several.

## 5. Primary workspace

Content max-width 1440px (centered when the viewport exceeds it, e.g. large monitors — content does not stretch edge-to-edge past 1440px, matching the design system's stated max). Page content begins with the H1 page-title pattern (`DESIGN_SOURCE_AUDIT.md` §2.3) inside the top-bar's visual region per the design system's own note ("one per page, in top bar region") — meaning the page title is part of the scrolling workspace immediately below the fixed 56px bar, not a second bar.

## 6. What is explicitly NOT part of the shared shell

`/admin/social` keeps `SocialShell.tsx` unchanged in this phase. The public marketing site has its own header/footer (`PUBLIC_WEBSITE_SITEMAP.md`), structurally simpler (no sidebar, no context panel) and is not a variant of this shell — it is a different, lighter-weight layout that happens to share the same design tokens.

## 7. Density

The shell root carries `data-density="default"` per `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` §8. `/app`'s Content Pipeline and Social Inbox, and `/admin`'s Operations Queue and Audit Log, are the pages expected to opt into `dense` given the design system's own guidance ("content pipeline, inbox, logs" as the dense-mode use cases) — this is a per-page override on the same shell, not a different shell.
