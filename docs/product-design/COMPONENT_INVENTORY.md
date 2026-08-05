# Component Inventory

Design documentation only — a catalog of every reusable UI primitive the rest of this package assumes exists, cross-referenced to the design-system section that defines its appearance (`DESIGN_SOURCE_AUDIT.md`) and to where in the product it's used. Not a component-library implementation; naming is a recommendation for implementation, not a binding API.

| Component | Variants / states | Design-system ref | Used in |
|---|---|---|---|
| `Button` | primary, secondary, ghost, destructive, icon-only, disabled · sm/default/lg | §2.9 | Everywhere |
| `Input` | text, search (with ⌘K hint), select, date, textarea · default/focus/error/disabled | §2.9 | Forms, search, filters |
| `Chip` (status) | one per state colour × shape (circle/square/triangle/diamond/dashed) | §2.8 | Autopilot state, content pipeline state, integration status |
| `Chip` (filter/tag) | pill, dismissable, active/inactive | §2.9 | Filter rows, tag pickers |
| `PulseDot` | 8 AI states (Observing…Learning) | §2.7 | Top bar agent status, Copilot, AI-active cards |
| `WorkflowRail` | N-stage dot–line pattern, per-stage complete/active/future | §2.7 | Mission progress, onboarding progress |
| `ConfidenceBar` | 5-segment, numeric label, below-threshold warning state | §2.7 | Copilot/mission AI decisions |
| `ProcessingBar` | indeterminate (sweep), determinate (fill + %) | §2.7 | Long-running actions |
| `Card` (panel) | operational, secondary/nested, elevated, interactive, selected, AI-active, critical-alert | §2.6 | All list/detail surfaces |
| `MetricCard` | plain, AI-tinted · with/without sparkline | §2.10 | Command Center, Analytics, Finance |
| `Chart.Area` / `Chart.Bar` / `Chart.Sparkline` / `Chart.Radial` | per §2.11 | Analytics, Reports, Finance |
| `Sidebar` | collapsed/expanded/pinned, one instance configured per surface (`/app` items vs. `/admin` items) | `SIDEBAR_INTERACTION_SPECIFICATION.md` | Shared shell |
| `TopCommandBar` | with/without staff-context badge, with/without agent-status slot | `SHARED_SHELL_SPECIFICATION.md` §3 | Shared shell |
| `ContextPanel` | pinned/overlay/sheet/tab, content types: AI explanation, mission detail, approval detail, record quick-view | `SHARED_SHELL_SPECIFICATION.md` §4 | `/app`, `/admin` |
| `StaffContextBadge` | single variant, always paired with a "return to /admin" link | `ROLE_AND_PERMISSION_EXPERIENCE.md` §6 | `/app` when staff-viewed |
| `NavItem` | active/inactive, collapsed(icon+tooltip)/expanded(icon+label), nested/section-label, badge-count | §2.9 | Sidebar, More sheet |
| `Table` → `StackedCard` | responsive pair — table ≥768px, stacked card <768px | §2.9, `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §5 | Every list page |
| `Tabs` (underline) | active/inactive | §2.9 | Detail pages with sub-views |
| `SegmentedControl` | 2+ options, active segment | §2.9 | Density/view toggles |
| `Switch` | on/off | §2.9 | Settings, automation toggles |
| `Skeleton` | row, card, text-line — never shown for <400ms of content | §2.9 | Every async load |
| `EmptyState` | icon + title + subtitle + optional action link, dashed-border card | §2.9 | Every list/collection page |
| `Toast` | success/warning/danger/info | §2.13 (motion), §2.2 (colour) | Global, action confirmations |
| `Modal` / `Sheet` | modal (desktop), auto-converts to bottom sheet <768px with grab handle | §2.6, `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §8 | Confirmations, create flows |
| `ContextMenu` | items + destructive divider | §2.9 | Row actions (content items, missions) |
| `Tooltip` | default | §2.9 | Collapsed sidebar, icon-only buttons |
| `Breadcrumb` | mono, current-step full-colour | §2.9 | Deep detail pages (e.g. Client detail → workspace) |
| `Pagination` | numbered + "N of M" meta | §2.9 | Long lists |
| `NotificationItem` | unread/read/warning | §2.9 | Notification menu |
| `ChannelTile` | connected/disconnected, per-platform monochrome glyph + identity bar | §2.12 | Integrations, `/app/integrations` |
| `Avatar` | user, gradient fallback | §2.1 (compact lockup pattern) | Top bar, Team |
| `BrandLockup` | primary, sidebar/header, compact/collapsed | §2.1 | Public header, sidebar, favicons |
| `BottomTabBar` | 5-slot, active state, live-pulse overlay | `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §2 | Mobile `/app`, `/admin` |
| `Drawer` | left-slide nav (tablet/mobile sidebar replacement) | `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §1 | <768px |
| `FilterSheet` | bottom sheet form of the desktop filter row | `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §6 | Every filterable list, mobile |
| `Calendar.Month` / `Calendar.Agenda` | responsive pair | `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §7 | `/app/content/calendar` |

## Component composition notes

- Every list-type page composes from exactly one of `Table`/`StackedCard`, `EmptyState`, `Skeleton`, and (if filterable) the filter row/`FilterSheet` pair — this four-piece combination is the "list page" pattern referenced throughout `PAGE_BY_PAGE_SPECIFICATIONS.md` rather than re-describing it per page.
- Every detail-type page (mission detail, lead detail, artifact detail) composes from `ContextPanel` (when reached from a list) or a full-page equivalent using the same internal layout (when it has its own route) plus `WorkflowRail`/`ConfidenceBar` where AI involvement applies.
- `Chip` (status) is the only component allowed to encode meaning through colour+shape without a text label physically adjacent, and only because the label is embedded in the chip itself (e.g. "PUBLISHED") — no other component in this inventory may rely on colour alone.
