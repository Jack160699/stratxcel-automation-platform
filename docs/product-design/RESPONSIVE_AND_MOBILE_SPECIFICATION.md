# Responsive & Mobile Specification

Design documentation only. Breakpoint values are the exact tokens from `DESIGN_TOKEN_IMPLEMENTATION_MAP.md` §5 (`--sx-bp-sm 480 / md 768 / lg 1024 / xl 1280 / 2xl 1440`) — restated here only where behavior, not the number, is the point.

## 1. Sidebar across breakpoints

| Range | Behavior |
|---|---|
| ≥1024px | Full hover/pin/keyboard-expand sidebar, `SIDEBAR_INTERACTION_SPECIFICATION.md` |
| 768–1023px | Fixed 64px rail, icon-only, tooltips on tap-and-hold or focus, **no hover-expand** |
| <768px | Sidebar is gone; replaced by a drawer opened from a menu icon in the top bar (full nav list, same grouping as desktop expanded mode, slides in from the left, scrim behind it, closes on item selection or scrim tap) |

## 2. Mobile navigation (<768px, primary pattern <480px)

56px bottom tab bar + safe-area inset, exactly as specced: **Home, Copilot, Missions, Approvals, More** (client app) — the admin equivalent substitutes Agency-appropriate items (Overview, Clients, Missions, Approvals, More) so the bar always has exactly 5 slots and the same visual weight, never more than 5 (a 6th item has nowhere to go except into More).
- Active tab: accent icon + label, small live-pulse dot overlay if that section has running agent activity (mirrors the sidebar's active-item accent treatment, adapted to a bottom bar).
- **More** opens a bottom sheet containing every remaining nav item from the full sidebar list, grouped exactly as the desktop sidebar groups them (`CLIENT_APP_INFORMATION_ARCHITECTURE.md` §1 / `ADMIN_INFORMATION_ARCHITECTURE.md` §1) — not a flattened, re-ordered list.
- Touch targets ≥44px per the accessibility rule, applied to every tab and every row inside the More sheet.

## 3. Context / Agent panel across breakpoints

| Range | Behavior |
|---|---|
| ≥1440px | Pinned, 320/380px, permanent |
| 1280–1439px | Overlay, slides in, dismissable |
| <1280px, ≥768px | Same overlay behavior as above (tablet doesn't get a third treatment — it inherits the medium-desktop behavior) |
| <768px (mobile) | Becomes a **dedicated Agent tab** — not a sheet that appears contextually, but a persistent 6th concept accessible from **More** (or, on `/app`, folded into the **Copilot** bottom-tab slot itself, since Copilot already is the AI-explanation surface — a mission/approval detail opened on mobile pushes onto the same Copilot tab as a sub-view rather than needing a separate panel concept) |

## 4. Cards

4-up (desktop) → 2-up (@1024) → 1-up (@480). Padding steps 20px → 16px at the same breakpoints the card count changes, not independently.

## 5. Tables → stacked cards (@768)

Every data table in `/app` and `/admin` (missions list, approvals list, clients list, audit log, etc.) becomes a stacked-row card below 768px: **title + status chip + one metric**, per the design system's explicit rule — not an attempt to shrink the table itself (horizontal-scroll tables are excluded by this rule; the design system does not offer horizontal-scroll as an option). Which single metric survives is chosen per table in `PAGE_BY_PAGE_SPECIFICATIONS.md` (e.g. Missions: estimated cost; Approvals: age/time pending; Clients: member count) — always the one number a person glancing at a phone would want first.

## 6. Filters

Collapse into a single `Filter` button (opens a bottom sheet with the same filter controls the desktop inline row shows) at any width where the inline filter row would no longer fit its content without wrapping — in practice, this tracks the 768px table breakpoint, since filters and tables are almost always paired.

## 7. Calendar

Month grid (desktop) → agenda list (mobile), i.e. `/app/content/calendar` renders as a day-by-day scrolling list below 768px rather than a shrunk grid — a 7-column month grid is not usable at mobile widths and the design system explicitly calls for the agenda substitution rather than a cramped grid.

## 8. Modals → bottom sheets (@768)

Every modal (confirmation dialogs, the invite-member modal, the create-mission modal, etc.) becomes a bottom sheet below 768px: full-width, rounded top corners only (`--sx-radius-lg`), a 4px grab handle centered at the top, slide-up entrance using the same 200ms `cubic-bezier(.2,.8,.2,1)` curve the design system specifies for modal/sheet motion (only the axis changes, not the timing).

## 9. Charts

Above 480px: full chart with axis labels. Below 480px: grid labels drop (per the design system's own rule), but the last-value marker dot stays — a mobile user should still be able to read "what is it right now" even if the historical axis is illegible at that width.

## 10. Density on mobile

Mobile always effectively renders at something closer to the **Comfortable** density numbers for touch-target reasons (44px minimum touch targets exceed the 40px "default" row height), regardless of what density the same page uses on desktop — this is not a separate density mode, it's the accessibility floor (`DESIGN_SOURCE_AUDIT.md` §2.16) overriding density on any control smaller than 44px when the viewport is touch-primary.

## 11. What does not change on mobile

Color tokens, type scale (font sizes do not shrink below what's specified for body/label text — the design system's type scale is already tuned for legibility, and shrinking it further on mobile would violate the accessibility contrast/size rules), motion timings, and the AI visual language primitives (pulse dot, mono state line) are identical across all breakpoints — only layout, density, and navigation chrome change.
