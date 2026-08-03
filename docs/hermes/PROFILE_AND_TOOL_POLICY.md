# Profile and Tool Policy

Each capability area is a **Hermes profile** (`hermes --profile <name>` — an isolated
`HERMES_HOME` with its own config, memory, skills, sessions per the documented Profile
Isolation model), not a bespoke engine. Profiles do not get direct access to raw production
credentials for any external system; sensitive tools are always brokered through the
**Stratxcel MCP tool server** (see [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md)), which
Hermes reaches like any other MCP server — tools show up namespaced as
`mcp_stratxcel_<tool_name>` and can be filtered per profile via Hermes' documented per-server
include/exclude glob lists.

Built-in Hermes toolsets referenced below (`web`, `terminal`, `browser`, `memory`,
`delegate_task`, etc.) are the ones enumerated in `user-guide/features/tools.md` (reviewed
2026-08-04). Per-profile enabling/disabling uses Hermes' documented
`agent.disabled_toolsets` config and `hermes tools` toolset selection — exact config keys to be
finalized against the version deployed (see MANUAL_REQUIREMENTS.md).

## Common rules across every profile

- **Forbidden everywhere**: `terminal`/`process`/`execute_code` against anything outside the
  mission's own disposable container workspace; any built-in tool that could reach Stratxcel's
  Supabase project directly (no DB credentials are ever placed in a profile's `.env`); raw
  `x_search`/paid-API tools unless the profile explicitly requires them.
- **Required context on every mission**: `tenantId`, `missionId`, the profile name, and a
  Stratxcel-issued scoped context bundle (Brand Brain facts, prior approvals, constraints) —
  never the tenant's raw credentials.
- **Approval boundary**: any Stratxcel MCP tool tagged `sensitive: true` in its manifest always
  creates an `ApprovalRequest` instead of executing — this is enforced server-side in the
  Stratxcel MCP tool server, not by profile config, so it can't be bypassed by a prompt.
- **Workspace policy**: `terminal.backend: docker`, one ephemeral container per mission,
  `docker_volumes` scoped to `/workspaces/{tenantId}/{missionId}` only.
- **Memory policy**: see [MEMORY_POLICY.md](MEMORY_POLICY.md) — profile memory is
  operational/procedural only, never authoritative client data.

## Profiles

### orchestrator
- **Purpose**: decomposes an incoming mission, delegates to other profiles via `delegate_task`,
  aggregates results.
- **Allowed tools**: `delegate_task`, `todo`, `clarify`, `memory` (read-only recall of its own
  operational notes), `mcp_stratxcel_get_mission_context`.
- **Forbidden tools**: everything execution-capable (`terminal`, `browser_*`, publishing/deploy
  tools) — orchestrator never touches external systems itself.
- **Required context**: full mission brief, tenant plan/limits, which sub-profiles are enabled
  for this tenant's plan tier.
- **Outputs**: a mission plan (sequence of sub-missions) + final aggregated `ArtifactManifest`.
- **Approval boundary**: none itself (it doesn't execute); any sensitive action a sub-mission
  needs still routes through that sub-mission's own approval boundary.
- **Model requirement**: strong planning/reasoning model (highest reasoning effort tier
  available); this is the one profile where model cost is secondary to plan quality.

### research
- **Purpose**: market/competitor/SEO/general research; produces read-only reports.
- **Allowed tools**: `web_search`, `web_extract`, `browser_navigate`, `browser_snapshot`,
  `mcp_stratxcel_semrush_*` (read-only research MCP tools), `memory` (read-only).
- **Forbidden tools**: `terminal`/`execute_code` (no code execution needed for research),
  anything publishing/write-capable.
- **Required context**: research brief, target domain/competitors, tenant's existing Brand
  Brain facts (to avoid re-deriving known information).
- **Outputs**: `ArtifactManifest` pointing to a structured report (markdown/JSON), no side
  effects.
- **Approval boundary**: none — read-only by construction, nothing to approve.
- **Model requirement**: mid-tier model with good long-context summarization; web-heavy, not
  reasoning-heavy.

### content
- **Purpose**: drafts marketing/social/blog copy for review.
- **Allowed tools**: `web_search` (fact-checking), `memory` (read-only Brand Brain excerpts via
  Stratxcel context, not Hermes memory), `mcp_stratxcel_content_draft_save` (writes a *draft*,
  not a publish).
- **Forbidden tools**: any `mcp_stratxcel_*_publish` tool, `terminal`, WhatsApp/Meta send tools.
- **Required context**: Brand Brain voice/tone rules, target platform, prior approved examples.
- **Outputs**: draft content artifacts in Stratxcel's existing Social Autopilot content
  pipeline (`lib/social/repositories/content.ts` — read as prior art, not modified by this
  branch), status `pending_review`.
- **Approval boundary**: publishing is a separate, later action taken by a human in the
  existing Social Autopilot UI — content profile never calls a publish tool itself.
- **Model requirement**: strong writing quality model; reasoning effort low/medium is
  sufficient, favor a model tuned for tone-following.

### seo
- **Purpose**: technical SEO audits, on-page recommendations, structured reports.
- **Allowed tools**: `web_search`, `web_extract`, `browser_navigate`, `browser_snapshot`,
  `mcp_stratxcel_semrush_*` (site_audit, domain_overview, keyword_research, position_tracking —
  read-only), `mcp_stratxcel_lighthouse_check` (read-only).
- **Forbidden tools**: any tool that writes to a live site, `terminal`.
- **Required context**: target site URL(s), tenant's current SEO baseline if known.
- **Outputs**: `ArtifactManifest` → SEO/conversion report (this is exactly Test Mission 1, see
  [END_TO_END_TEST_PLAN.md](END_TO_END_TEST_PLAN.md)).
- **Approval boundary**: none — read-only.
- **Model requirement**: mid-tier, good at structured report synthesis from tool output.

### website-development
- **Purpose**: code changes to a client website in a branch/preview, never directly to
  production.
- **Allowed tools**: `terminal`, `read_file`, `patch`, `execute_code` — **only inside the
  mission's Docker workspace**, `mcp_stratxcel_git_branch_create`, `mcp_stratxcel_vercel_preview_deploy`.
- **Forbidden tools**: `mcp_stratxcel_vercel_promote_production` (sensitive — always an
  `ApprovalRequest`), any tool touching a repo other than the one named in the mission context,
  any direct Vercel/GitHub token usage (must go through the brokered MCP tools).
- **Required context**: target repo, target branch-naming convention, which files/paths are
  in-scope for this tenant.
- **Outputs**: a pushed branch + a Preview deployment URL as the artifact; this is exactly Test
  Mission 2.
- **Approval boundary**: production promotion is **always** gated — see
  [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md). Branch creation and Preview deploys are
  reversible/low-risk and do not require pre-approval, only post-hoc audit logging.
- **Model requirement**: strong coding model; container backend is mandatory for this profile
  specifically (arbitrary code execution).

### crm
- **Purpose**: lead/contact enrichment, pipeline notes, follow-up drafting.
- **Allowed tools**: `web_search` (enrichment), `mcp_stratxcel_crm_read`,
  `mcp_stratxcel_crm_note_write`, `mcp_stratxcel_crm_draft_followup` (drafts only).
- **Forbidden tools**: `mcp_stratxcel_crm_send_email`, `mcp_stratxcel_whatsapp_send` (always
  sensitive → approval), `terminal`.
- **Required context**: the specific contact/lead record scope, tenant CRM field schema.
- **Outputs**: enrichment/notes written directly (low-risk, reversible); outbound
  communications are drafts pending approval.
- **Approval boundary**: any outbound message to a real client's customer is an
  `ApprovalRequest`, no exceptions.
- **Model requirement**: mid-tier, fast/cheap — this profile runs at high volume.

### proposal
- **Purpose**: drafts client proposals/quotes from a brief + Brand Brain + pricing rules.
- **Allowed tools**: `mcp_stratxcel_proposal_draft_save`, `web_search` (comparable pricing
  research), `memory` (read-only).
- **Forbidden tools**: `mcp_stratxcel_proposal_send`, any Razorpay tool (payment-adjacent —
  always sensitive), `terminal`.
- **Required context**: pricing rules/floor set by Stratxcel admin, tenant's plan tier.
- **Outputs**: draft proposal document artifact, `pending_review`.
- **Approval boundary**: sending a proposal to a client, or any pricing that deviates from
  the configured floor, is an `ApprovalRequest`.
- **Model requirement**: mid/high-tier writing model, needs to reliably follow numeric pricing
  constraints — do not use a model without confirmed strong instruction-following at low
  reasoning-effort cost tiers.

### media
- **Purpose**: image/video asset generation and light editing for campaigns.
- **Allowed tools**: `vision_analyze`, `image_generate`, `text_to_speech`,
  `mcp_stratxcel_asset_save_draft`.
- **Forbidden tools**: any direct publish-to-platform tool, `terminal`.
- **Required context**: brand asset guidelines, target platform aspect ratios/specs.
- **Outputs**: draft media artifacts referenced by manifest (see
  [ARTIFACT_FLOW.md](ARTIFACT_FLOW.md) — binary assets are never inlined in events).
- **Approval boundary**: none for generation itself (reversible, no external effect); use in a
  published post is gated by the `content`/publish approval boundary, not duplicated here.
- **Model requirement**: whichever image/video generation backend Stratxcel selects (see
  MANUAL_REQUIREMENTS.md) plus a mid-tier text model for prompts.

### operations
- **Purpose**: internal Stratxcel/agency operations — status rollups, reminders, light
  scheduling, cron-driven recurring reports.
- **Allowed tools**: `cronjob` (Hermes' own Jobs API, for recurring missions like weekly SEO
  reports), `todo`, `mcp_stratxcel_get_mission_context`, `web_search`.
- **Forbidden tools**: anything with an external side effect on a client's live systems —
  operations is about Stratxcel's own agency workflow, not client-facing actions.
- **Required context**: which recurring job, its schedule, its target tenant scope.
- **Outputs**: status reports, scheduled-mission triggers (which themselves land in other
  profiles' queues, each with its own approval boundary).
- **Approval boundary**: none for report generation; any job it schedules that touches a
  sensitive tool still hits that tool's own gate.
- **Model requirement**: cheap/fast — mostly orchestration and templated reporting.

## Reconciliation with the existing `hermes_profile` / 12-tool allowlist

`origin/main` already stores a `hermes_profile` string on each mission (assigned by
`packages/missions/src/service-catalogue/catalogue.ts`), using the master brief's six-value set:
`stratxcel-orchestrator`, `stratxcel-research`, `stratxcel-content`, `stratxcel-developer`,
`stratxcel-seo`, `stratxcel-admin-growth`. This document's nine profiles are the **Hermes-native**
profile set (what `hermes --profile <name>` actually runs); the mapping from the existing,
coarser StratExcel-side label to a Hermes-native profile is a lookup a future integration layer
owns, not a redesign of the existing field:

| `missions.hermes_profile` (existing) | Hermes-native profile(s) (this doc) |
|---|---|
| `stratxcel-orchestrator` | `orchestrator` |
| `stratxcel-research` | `research` |
| `stratxcel-content` | `content`, `media` |
| `stratxcel-developer` | `website-development` |
| `stratxcel-seo` | `seo` |
| `stratxcel-admin-growth` | `crm`, `proposal`, `operations` |

Similarly, `apps/hermes-gateway`'s existing 12-tool allowlist (`packages/hermes/src/tools/contracts.ts`)
is StratExcel's already-implemented, already-tested tool business logic — `get_brand_context`,
`create_draft_artifact`, `update_mission_progress`, `request_approval`, `get_approval_status`,
`create_human_handoff`, `query_publication_status`, `create_crm_lead`,
`attach_research_evidence` (default-allowed today) plus `submit_publish_request` and
`create_website_change_request` (deliberately excluded by `STRATXCEL_CONTROLLED_TOOLS`). This
document's `mcp_stratxcel_*` names in the tables above are illustrative of the *pattern*
(brokered, approval-gated, tenant-scoped); the concrete tool set a future integration layer
exposes to real Hermes over MCP should be these 12 (renamed to the `mcp_stratxcel_` convention
for namespace-collision safety per Hermes' MCP tool prefixing), not a parallel invented set.
`submit_publish_request`/`create_website_change_request` staying non-callable-by-default is
already exactly this document's approval-boundary rule for `content`/`website-development`, just
implemented a layer earlier (rejected at dispatch) than the `ApprovalRequest` flow described in
[APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md) — reconciling the two (dispatch-time rejection
vs. approval-request creation) is a design decision for the follow-up branch, not resolved here.

## Toolset allowlisting mechanism (Hermes-native)

Two independent Hermes-native controls are combined per profile, per Hermes' documented
config surface (`user-guide/configuration.md`, `user-guide/features/mcp.md`, reviewed
2026-08-04):

1. `agent.disabled_toolsets` in each profile's `config.yaml` — hides entire built-in toolsets
   (e.g., `terminal`, `browser`) globally for that profile.
2. Per-MCP-server `include`/`exclude` glob lists (fnmatch-style) on the `stratxcel` MCP server
   entry — controls exactly which brokered Stratxcel tools that profile can see at all, so a
   `content` profile literally cannot enumerate a `vercel_promote_production` tool, not just
   "won't be told to use it."

Both layers are additive-restrictive (deny by default, explicit allow), matching Hermes'
documented gateway authorization default of "deny" when nothing else grants access.
