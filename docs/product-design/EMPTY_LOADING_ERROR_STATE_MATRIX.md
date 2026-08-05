# Empty / Loading / Error State Matrix

Design documentation only. `PAGE_BY_PAGE_SPECIFICATIONS.md` calls out page-specific empty/error states where they differ from the default; this document is the systematic reference — one row per state type, applicable everywhere, with the exact component and copy pattern to use so implementation doesn't reinvent it per page.

## 1. Loading

| Context | Component | Rule |
|---|---|---|
| Any content that may take >400ms | `Skeleton` matching the real content's shape (row skeleton for tables, card skeleton for cards, text-line skeleton for prose) | Never a spinner — explicit design-system rule, `DESIGN_SOURCE_AUDIT.md` §2.9 |
| Content that reliably resolves <400ms | Nothing — render the final state directly | Showing a skeleton for sub-400ms content is itself a violation of the same rule |
| A long-running action the user just triggered (mission run, provisioning) | `ProcessingBar` — indeterminate sweep if duration unknown, determinate fill+% if known | §2.7 |
| Copilot generating a reply | `PulseDot` (Generating state, `#3AA0FF`, 1.2s pulse) + streaming text, not a skeleton | §2.7 |

## 2. Empty

Pattern (verbatim from the design system's own worked example, §2.9): **Title** (what's missing) → **Subtitle** (why, or what will fill it) → optional **Action** (imperative verb, accent text link). Dashed-border card, centered, icon at top.

| Page/list | Title | Subtitle | Action |
|---|---|---|---|
| `/app/missions` (first-run) | "No missions yet." | "Start one from Copilot, or create one manually." | "New mission" |
| `/app` Command Center (0 missions ever) | Reuses existing `OnboardingPanel` pattern | — | "Start with Copilot" |
| `/app/approvals` | "Nothing pending." | — | none |
| `/app/content` (no content yet) | "No content yet." | "Autopilot will propose a plan once brand setup is complete." | "Set up brand" (if brand incomplete) or "Create a post" |
| `/app/inbox` | "No conversations yet." | "Replies and comments will appear here once you're publishing." | none |
| `/app/crm` | "No leads yet." | "Leads from WhatsApp, your website form, and manual entry all land here." | "Add a lead" |
| `/app/files` | "No files yet." | "Files from missions and content will appear here automatically." | none |
| `/app/team` (only the owner) | "Just you for now." | "Invite teammates to share this workspace." | "Invite member" |
| `/admin/clients` (should not realistically be empty, but) | "No clients yet." | — | none — this is a signal something is wrong, not a normal first-run state |
| `/admin/handoffs` | "No open handoffs." | "Nothing needs a human right now." | none |
| `/admin/audit` (filtered to nothing) | "No matching events." | "Try a wider date range or clear filters." | "Clear filters" |

Rule: **never fabricate example data** to fill an empty state — every empty state above shows real zero-state copy, not sample rows.

## 3. Error

Pattern (from `CONTENT_AND_UX_VOICE.md` §2): what happened → what it affects → what to do. Retry action present whenever the failure is plausibly transient (network, timeout); no retry action when the failure is a genuine denial (permission, not-found) — retrying a 403 teaches the user nothing and just repeats the confusion.

| Failure class | Example copy | Retry? |
|---|---|---|
| Network/fetch failure on a list load | "Couldn't load missions. Your connection may have dropped." | Yes |
| Mutation failure (e.g. approval decide) | "Couldn't record your decision. The approval is still pending — try again." | Yes |
| Permission denial (403) | "Your role (Viewer) can't decide approvals for this client." | No — this is the existing exact copy pattern already used in `app/admin/(shell)/page.tsx`'s approvals card, reused everywhere a permission gate blocks an action |
| Not found (404) | "This mission no longer exists, or you don't have access to it." | No |
| Validation failure (e.g. onboarding slug collision) | Inline field error, form stays populated | N/A — user corrects and resubmits, not a retry of the same input |
| Background/system failure surfaced to a user (mission `FAILED`) | Mission's own failure reason, shown on its detail page, not a generic banner | Depends on the underlying cause |

## 4. Permission

Two distinct treatments, chosen per `ROLE_AND_PERMISSION_EXPERIENCE.md` §2:

| Case | Treatment |
|---|---|
| Role can never view this page/section at all (e.g. `viewer` and `/app/billing`) | Nav item does not render. Direct URL access shows the same "not found" treatment as a genuinely missing route — **not** a page that confirms the feature exists but denies it, matching the RSC-disclosure precedent from this branch's own earlier security fix. |
| Role can view but not act (e.g. `operator` viewing `/app/approvals` without `approval:decide`) | Page renders fully; the specific action (Approve/Reject buttons) is either hidden or disabled-with-tooltip depending on whether *seeing that the action exists* leaks anything sensitive — for approvals specifically, the existing precedent (`app/admin/(shell)/page.tsx`) is to omit the approvals card contents entirely and show the permission-denied copy from the table above instead of a disabled button, and this documentation package keeps that precedent rather than introducing a second pattern. |

## 5. Stale/conflict states (not covered by the 3 categories above)

| Situation | Treatment |
|---|---|
| Approval already decided by someone else before this user's action lands | "This approval was already decided by {name}." — surfaced from the existing `ApprovalAlreadyDecidedError`/409 handling already implemented server-side, not a new mechanism, just new copy for it. |
| Tenant slug taken during onboarding/client creation | Inline field error at the slug input: "\"{slug}\" is already in use — try a different slug." — verbatim, this exact copy already exists in `CreateClientForm.tsx` and is correct as-is. |
| Stale active-tenant cookie (tenant no longer accessible) | Silent fallback to the first accessible tenant — already the exact behavior of `resolveCurrentTenant()`; no error surfaced to the user because none is warranted, this is expected and handled. |

## 6. What this matrix deliberately does not specify

Exact icon choices for each empty state, exact retry-backoff timing, and toast-vs-inline-banner placement per error are implementation decisions within the bounds already set by `COMPONENT_INVENTORY.md`'s `EmptyState`/`Toast` components — this matrix fixes the *copy pattern and decision logic*, not every pixel.
