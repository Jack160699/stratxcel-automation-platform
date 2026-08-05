# Page-by-Page Specifications

Design documentation only. Public-site pages are specified in full in `PUBLIC_WEBSITE_SITEMAP.md` (purpose/user/sections/CTAs/states) and are not repeated here. This document covers every `/app` and `/admin` page. Data shapes referenced (mission states, approval kinds, lead statuses, queue statuses, wallet ledger types) are the real ones already implemented in `packages/missions`, `packages/approvals`, `packages/leads-and-crm`, `packages/queue`, `packages/payments-and-wallet` — read from source during this pass, not invented.

**Defaults that apply to every page below unless a page overrides them** (stated once here to avoid repeating 40 times): Loading state = `Skeleton` matching the page's primary content shape, never a spinner for content under 400ms. Error state = inline error card, what/effect/action per `CONTENT_AND_UX_VOICE.md` §2, with a retry action where the failure is retryable. Permission state = the page/nav item simply does not appear for a role that cannot view it (`ROLE_AND_PERMISSION_EXPERIENCE.md` §2); where a role can view but not act, actions render disabled with a tooltip explaining the required permission rather than being hidden. Mobile composition = standard responsive rules from `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` (table→stacked-card, filters→sheet, etc.) unless a page needs something unusual, which is called out.

---

## `/app` — Client Workspace

### Command Center — `/app`
- **Purpose**: the 3–5 things needing a human right now, plus a snapshot.
- **Sections**: header (client name, role) → 4-max metric row (missions active, approvals pending, unread inbox, AI actions today) → recent missions list (5) → approvals requiring attention list → integration status row.
- **Primary action**: none single — this page is a router to the thing that matters most right now.
- **Secondary actions**: quick links into Missions/Approvals/Inbox.
- **Opens on click**: mission row → `/app/missions/{id}`; approval row → context panel (approval decision); integration row → `/app/integrations`.
- **Data source**: `listMissionsForTenant`, `listPendingApprovals` (both existing, `@stratxcel/missions`/`@stratxcel/approvals`), contact-message count.
- **Empty state**: zero tenants edge case doesn't apply here (onboarding handles it); zero missions ever → the same first-run pattern the existing `OnboardingPanel.tsx` already implements, re-skinned.
- **Context panel**: selected approval's decision surface.
- **Copilot relationship**: a persistent "Ask Copilot" entry point in the header, per `CLIENT_APP_INFORMATION_ARCHITECTURE.md` §3.

### Copilot — `/app/copilot`
- **Purpose**: conversational entry point for starting missions and asking questions about workspace state.
- **Sections**: message thread (full width) → composer at the bottom → right context panel showing the AI state primitives (pulse dot, workflow rail, confidence bar) for whatever the current exchange is doing.
- **Primary action**: send message / attach file.
- **Secondary actions**: "start a mission from this" once Copilot proposes one; jump to an existing mission it references.
- **Opens on click**: a referenced mission/approval opens in the context panel, or navigates to its full page if already on mobile (no panel to use).
- **Data source**: existing Copilot run/action data model (already proven at `/admin/social/copilot`, generalized).
- **Loading**: message-in-progress uses the `PulseDot` + streaming text, not a skeleton.
- **Mobile**: full-screen thread, composer fixed at bottom above the tab bar; this is the one page where the "context panel becomes a tab" rule (`RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §3) is largely moot since Copilot already *is* that tab.

### Missions — `/app/missions`
- **Purpose**: structured, auditable record of every mission for this tenant.
- **Sections**: filter row (state, date range) → table: goal text, service, state chip, estimated cost.
- **Primary action**: `New mission` (opens Copilot pre-filled, or a lightweight create form — decision for implementation, both funnel into the same `createAndEstimateMission`).
- **Opens on click**: row → `/app/missions/{id}`.
- **Data source**: `listMissionsForTenant`. States rendered with the existing state-chip mapping (DRAFT, ESTIMATING, AWAITING_FUNDS, READY, QUEUED, RUNNING, AWAITING_INPUT, AWAITING_APPROVAL, HUMAN_HANDOFF, RESUMED, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED, BLOCKED — all already defined, just re-skinned onto the state-chip component instead of the current ad-hoc `STATE_STYLES` map).
- **Permission**: requires `mission:view` at minimum; `New mission` requires `mission:create`.
- **Mobile**: stacked card, metric shown = estimated cost.

### Mission detail — `/app/missions/{id}`
- **Purpose**: everything about one mission — goal, state, event timeline, artifacts, cost.
- **Sections**: header (goal, state chip, cost) → `WorkflowRail` (mapped from mission state) → event timeline (mono timestamps) → artifacts list → related approvals.
- **Primary action**: `Cancel mission` (if state allows, requires `mission:cancel`); resolve `AWAITING_INPUT` if the mission is blocked on a question.
- **Opens on click**: an artifact → `/app/files/{artifactId}`; a related approval → its decision surface.
- **Data source**: `listMissionEvents`, mission row itself.
- **Error state**: a `FAILED`/`BLOCKED` mission shows its failure reason plainly (voice rule example in `CONTENT_AND_UX_VOICE.md` §2) rather than just the chip.
- **Copilot relationship**: "Continue in Copilot" action re-opens this mission's thread.

### Approvals — `/app/approvals`
- **Purpose**: everything pending a decision.
- **Sections**: filter (kind: content_publish/spend/deploy/other) → list of pending approvals, each showing kind, subject summary, age.
- **Primary action**: per-row `Approve`/`Reject` (opens the decision surface in the context panel, requires `approval:decide`).
- **Data source**: `listPendingApprovals`.
- **Empty state**: "Nothing pending." (verbatim pattern already proven in the existing platform approvals page).
- **Permission**: a `viewer`/`operator` without `approval:decide` sees the list but not the decide buttons — matches the existing `requirePermission` gate already implemented for this exact permission today.

### Approval detail — `/app/approvals/{id}`
- Same content as the context-panel decision surface, promoted to a full page for direct-link/mobile use: kind, full subject payload (formatted, not raw JSON), requested-by, decide actions with confirmation copy per `CONTENT_AND_UX_VOICE.md` §4.

### Content Overview — `/app/content`
- **Purpose**: status-grouped front door for all content (`CLIENT_APP_INFORMATION_ARCHITECTURE.md` §4).
- **Sections**: status tabs (Draft/Ready/Scheduled/Published/Needs review) → content card grid, each using the content-pipeline chip set.
- **Primary action**: `New post` → `/app/content/studio`.
- **Opens on click**: card → Content Studio (edit) or a quick-view in the context panel.
- **Data source**: same content-item table Social Autopilot already uses.

### Content Studio — `/app/content/studio`
- **Purpose**: creation/editing surface.
- **Sections**: media upload/preview → caption/copy editor (with AI-drafted confidence indicator if Copilot-generated) → channel + schedule picker → brand-check panel.
- **Primary action**: `Schedule` / `Publish now`.
- **Secondary**: `Save draft`, `Regenerate with AI`.
- **Data source**: content-item write path + Brand Brain for grounding.

### Calendar — `/app/content/calendar`
- **Purpose**: time-axis view of the same content items.
- **Sections**: month grid (desktop) / agenda list (mobile, per responsive spec) → day detail on click.
- **Primary action**: click an empty day → `New post` pre-filled with that date.

### Pipeline — `/app/content/pipeline`
- **Purpose**: pipeline-stage (kanban-style) view.
- **Sections**: columns per content-pipeline state, cards draggable between adjacent valid states only.
- **Density**: ships in `dense` mode per the design system's own guidance.

### Social Inbox — `/app/inbox`
- **Purpose**: replies/DMs/comments on published content.
- **Sections**: conversation list (filter by platform/unread) → thread view → quick-reply composer (with AI-suggested reply + confidence, matching the existing `shadow_mode`/`would_send` concept already in the WhatsApp shadow-message model, generalized to social).
- **Density**: `dense`.
- **Data source**: existing inbox data model, generalized from `/admin/social/inbox`.

### Content Analytics — `/app/analytics`
- **Purpose**: performance of published content.
- **Sections**: metric row (reach, engagement rate, published count, AI actions) → reach chart → posts-by-platform stacked bar → top-performing content list.
- **Data source**: existing analytics aggregation behind `/admin/social/analytics`, generalized.

### Automations — `/app/automations`
- **Purpose**: configure what Autopilot is allowed to do without a human.
- **Sections**: per-capability toggle list (each a `Switch` + shadow/live mode indicator) → automation activity log.
- **Permission**: requires `integration:configure` or an equivalent automation-config permission.

### Brand — `/app/brand`
- **Purpose**: the Brand Brain — voice, products, pillars, rules, sources (already a proven concept per `lib/social/__tests__/brand-grounding.test.ts` seen earlier in this session).
- **Sections**: brand voice editor → product/pillar list → source documents → edit-in-place with feedback (existing capability per `brand-edit.test.ts`).
- **Permission**: `brand_brain:view` to see, `brand_brain:edit` to change.

### Website & SEO — `/app/website`
- **Purpose**: new capability (no existing UI found). Website health, SEO position tracking, suggested fixes.
- **Sections**: site health summary → keyword/position table → issues list with AI-suggested fixes.
- **Note**: flagged in `CLIENT_APP_INFORMATION_ARCHITECTURE.md` §5 as genuinely new — data source not yet implemented.

### Ads — `/app/ads`
- **Purpose**: new capability. Ad campaign performance and spend.
- **Sections**: campaign list → spend-vs-result metrics → per-campaign detail.
- **Note**: same "genuinely new" flag as Website & SEO.

### CRM & Leads — `/app/crm`
- **Purpose**: the tenant's own lead pipeline (`packages/leads-and-crm`, confirmed real: `LeadRow` with `source: whatsapp|website_form|manual|import`, `status: NEW|CONTACTED|QUALIFIED|WON|LOST`).
- **Sections**: status-column board (kanban, matching `LeadStatus`) or filterable table (toggle) → source filter.
- **Primary action**: `New lead` (manual source).
- **Opens on click**: card/row → `/app/crm/{leadId}`.

### Lead detail — `/app/crm/{leadId}`
- **Sections**: contact info (name/phone/email) → source + status (editable) → activity/metadata timeline → linked conversation if the lead originated from WhatsApp/website form.
- **Primary action**: status change (`NEW → CONTACTED → QUALIFIED → WON`/`LOST`).

### Conversations — `/app/conversations`
- **Purpose**: WhatsApp/website-form conversation threads tied to leads, distinct from Social Inbox (which is public social replies).
- **Sections**: thread list → message view.
- **Data source**: WhatsApp shadow-message model already implemented (`whatsapp_shadow_messages`), generalized past shadow-only once live sending activates.

### Files — `/app/files`
- **Purpose**: every artifact a mission or content item produced.
- **Sections**: filterable grid/list, grouped by source (mission/content/manual upload).
- **Opens on click**: → `/app/files/{artifactId}`.

### Artifact detail — `/app/files/{artifactId}`
- **Sections**: preview → metadata (source mission/content item, created date) → download/share actions.

### Reports — `/app/reports`
- **Purpose**: scheduled/exportable summaries (weekly brand report is already referenced as a concept in the existing notification-item example in the design source).
- **Sections**: report list (type, period, generated date) → view/export per report.

### Integrations — `/app/integrations`
- **Purpose**: this tenant's own connection status per channel/provider, using the `ChannelTile` component.
- **Sections**: connected tiles first, disconnected after → per-tile detail (permissions granted, token health) on click.
- **Permission**: `integration:configure` to connect/disconnect; view-only otherwise.

### Billing — `/app/billing`
- **Purpose**: this tenant's plan, payment method, wallet balance/ledger (same tables Finance in `/admin` rolls up agency-wide).
- **Sections**: plan summary → wallet balance (reusing the existing `wallet_accounts` read already proven) → ledger table (`credit_purchase`, `credit_bonus`, `reservation`, `reservation_release`, `debit_usage`, `refund`, `adjustment`) → payment method → invoices.
- **Permission**: `wallet:view` to see, `wallet:topup`/`wallet:spend` to act.

### Team — `/app/team`
- **Purpose**: manage this tenant's members.
- **Sections**: member list (name, role, status) → `Invite member` → pending invitations.
- **Primary action**: `Invite member` (requires `tenant:invite_member`) → role picker + email → sends invite per `AUTH_AND_ONBOARDING_FLOW.md` §4.
- **Secondary**: role change / remove member (requires `tenant:manage_members` — **owner only**, per the existing permission table).

### Settings — `/app/settings`
- **Purpose**: tenant profile, notification preferences, danger zone.
- **Sections**: business profile (from onboarding step 2, editable) → notification preferences → danger zone (leave workspace / delete workspace, owner-only with confirmation copy per `CONTENT_AND_UX_VOICE.md` §4).

---

## `/admin` — Internal Operations

### Agency Overview — `/admin`
- **Purpose**: agency-wide version of the Command Center pattern (`ADMIN_INFORMATION_ARCHITECTURE.md` §2).
- **Sections**: 4-max metric row (active clients, missions running across all tenants, approvals pending across all tenants, attention-required count) → recent activity across all tenants → "jump into a client" quick switcher.
- **Opens on click**: metric/activity row → the relevant agency-wide list (`/admin/missions`, `/admin/approvals`) pre-filtered.

### Clients — `/admin/clients`
- **Purpose**: every tenant.
- **Sections**: searchable table — name, plan/status, member count, last-active mission.
- **Opens on click**: row → `/admin/clients/{id}`.
- **Mobile**: stacked card, metric shown = last-active mission time.

### Client detail — `/admin/clients/{id}`
- **Sections**: member list → missions summary → wallet/finance summary → integration status → `View client workspace` action.
- **Primary action**: `View client workspace` → enters `/app` for that tenant with the `StaffContextBadge` shown (`ROLE_AND_PERMISSION_EXPERIENCE.md` §6).
- **Secondary**: invite a member on the client's behalf, adjust plan.

### All Missions — `/admin/missions`
- Same list pattern as `/app/missions`, agency-wide, with a **Client** column added and a client filter — the one structural difference between the tenant-scoped and agency-wide version of this page pattern (`ADMIN_INFORMATION_ARCHITECTURE.md` §4).

### Operations Queue — `/admin/queue`
- **Purpose**: background job health across all tenants.
- **Sections**: recent jobs table (type, status, attempts, scheduled) → dead-letter section (matches the existing `listDeadLetter` data already proven in `platform/queue`).
- **Permission**: staff-only by nature — no client ever sees queue internals.
- **Density**: `dense`.

### Approvals — `/admin/approvals`
- Agency-wide version of `/app/approvals`, **Client** column + filter added, same otherwise.

### Human Handoffs — `/admin/handoffs`
- **Purpose**: open `human_handoff` records needing a staff member.
- **Sections**: open handoffs table (client, mission, reason, time open) → assign-to-self/teammate → resolve with note.
- **Data source**: `human_handoffs` table (confirmed in the RLS migration read earlier this session) — no existing admin page surfaces it today; this is new UI over existing data.

### Leads — `/admin/leads`
- **Purpose**: the agency's own prospective-client pipeline — distinct from any tenant's `/app/crm`.
- **Sections**: same board/table pattern as `/app/crm` but scoped to Stratxcel's own leads table (a separate concept from `packages/leads-and-crm`'s per-tenant `crm_leads` — this needs its own agency-level data model, flagged as new).

### Finance — `/admin/finance`
- **Purpose**: agency-wide wallet/ledger roll-up.
- **Sections**: total balance across tenants → per-tenant balance table → ledger trend chart.
- **Opens on click**: tenant row → that tenant's wallet detail (same data `/app/billing` shows from the inside).

### Team — `/admin/team`
- **Purpose**: Stratxcel's own staff roster, `stratxcel_admins` management.
- **Sections**: staff list → add/remove staff (highly privileged action — confirmation copy states consequence explicitly per voice rules).

### Integrations — `/admin/integrations`
- **Purpose**: every integration type, every tenant — generalized from today's WhatsApp-only `platform/whatsapp`.
- **Sections**: integration-type tabs (WhatsApp, Razorpay, Drive, social OAuth) → per-type tenant connection table.

### System Health — `/admin/system`
- **Purpose**: operational monitoring.
- **Sections**: queue depth/dead-letter summary (rolls up `/admin/queue`) → API error-rate indicators → background worker status.
- **Data source**: needs an aggregation layer not yet confirmed to exist — flagged as an engineering scoping question in `IMPLEMENTATION_PHASES.md`.

### Audit Log — `/admin/audit`
- **Purpose**: read surface over `@stratxcel/audit` package's existing log data.
- **Sections**: filterable event table (actor, action, target, timestamp — mono).
- **Density**: `dense`.

---

## Cross-cutting: what every list page's mobile stacked-card shows

Per `RESPONSIVE_AND_MOBILE_SPECIFICATION.md` §5, the single surviving metric per list is fixed here so implementation doesn't have to re-decide it per page: Missions → estimated cost. Approvals → age. Clients → last-active mission. All Missions (admin) → client name. Operations Queue → attempt count. Leads → status. Team → role.
