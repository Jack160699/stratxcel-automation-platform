# Sidebar Interaction Specification

Design documentation only. This is the literal interaction contract for the one sidebar component shared by `/app` and `/admin` (`SHARED_SHELL_SPECIFICATION.md` §2).

## 1. Desktop states

| State | Width | Trigger |
|---|---|---|
| Collapsed (default) | 64px | Initial load, or pointer/focus leaves the sidebar |
| Expanded | 248px | Pointer hover over the sidebar, or keyboard focus lands inside it |
| Pinned-expanded | 248px | User has toggled the pin control — stays expanded regardless of hover/focus |

- Expand/collapse transition: `140ms ease-out`, matching the design system's hover/focus timing (`DESIGN_SOURCE_AUDIT.md` §2.13) — not the slower modal/sheet curve.
- **The expanded sidebar overlays the workspace rather than shifting it.** This is explicit in the brief and matches the design system's own "no layout thrash" bias (page/tab changes never slide) — the workspace's left edge does not move when the sidebar expands; the sidebar draws on top at `z-nav` (`DESIGN_TOKEN_IMPLEMENTATION_MAP.md` §5) with a subtle shadow (`--sx-shadow-lg`) separating it from the workspace beneath.
- Collapsing again (pointer/focus leaves) reverts to 64px unless pinned.

## 2. Pin control

A small pin icon at the top of the sidebar (beside or below the brand lockup), visible only while the sidebar is expanded (hover or pinned). Toggling it:
- **Pin on**: sidebar stays at 248px, and because it's now a persistent 248px, it **does** participate in workspace layout at that point (the overlay behavior is specifically for the transient hover-expanded state — a deliberately pinned sidebar is a layout decision the user made, not a transient reveal, so the workspace narrows to accommodate it, same as the ≥1440px pinned context panel in `SHARED_SHELL_SPECIFICATION.md` §4).
- **Pin off**: reverts to the hover/focus-driven 64↔248 behavior above.
- State persists per-user (not per-session) — a cookie or user-preference row, implementation detail not decided here, but the *experience* is that pin state survives reload and future visits.

## 3. Collapsed-mode content

At 64px: icon-only nav items, brand mark only (24px, no wordmark — the "compact/collapsed" lockup tier from `DESIGN_SOURCE_AUDIT.md` §2.1), no visible labels, no section labels. Every icon-only item shows a tooltip on hover/focus (120ms fade + 4px rise, per the dropdown/tooltip motion spec) — this is not optional, since collapsed mode has zero other way to identify an item.

## 4. Expanded-mode content

Full nav: brand lockup (sidebar/header tier — 24px mark + wordmark + product chip), section labels (mono uppercase 9.5px `#4B5666`, per `DESIGN_SOURCE_AUDIT.md` §2.9), full-width rows with icon + label, badge counts right-aligned in mono where relevant (e.g. unread inbox count), nested items indented with the 3px dot-bullet treatment. Profile/settings entry pinned at the bottom, visually separated from the nav groups above it by the sidebar's bottom edge, not a divider line (matches the design system's restraint around unnecessary borders).

## 5. Active route

Regardless of collapsed/expanded state: accent icon colour + 34px row height + accent-12% background + 2px inset-left accent bar (all exact values from `DESIGN_SOURCE_AUDIT.md` §2.9's navigation spec). In collapsed mode, the accent bar and icon colour are the only differentiators (no background tint needed at 64px width, since the row is nearly square) — but the icon colour change alone must be sufficient, which the design system's accent-reserved-for-active-nav rule already guarantees (no other icon in the sidebar is ever accent-coloured).

## 6. Keyboard behavior

- `Tab` into the sidebar expands it (focus-triggered expand, same as hover).
- Arrow-key or `Tab` navigation moves between nav items in visual order; focus ring is the standard 2px accent ring at 2px offset (`DESIGN_SOURCE_AUDIT.md` §2.16), visible even in collapsed 64px mode where the row is icon-only.
- Focus leaving the sidebar entirely (e.g. `Tab` into the top command bar) collapses it again, unless pinned — matching the pointer behavior exactly, since the brief specifies both pointer and keyboard as equivalent expand triggers.

## 7. Tablet and mobile — reference only

Full behavior in `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §1–2; summarized here for continuity: the hover/pin/expand model above applies only ≥1024px. At 1024px the sidebar becomes a fixed 64px rail with no hover-expand (touch/hybrid devices in this range don't reliably support hover); below 768px it becomes a drawer opened from a menu control in the top bar; below that, the sidebar is replaced entirely by the 56px bottom tab bar and does not exist as a sidebar at all.
