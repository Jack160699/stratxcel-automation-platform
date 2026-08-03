# Manual Requirements

Decisions, credentials, and verifications that only a human (or a future, deliberately-scoped
implementation branch) can resolve. Nothing below is decided by this branch.

## Decisions needed before real implementation

1. **Private network mechanism** between Vercel (Stratxcel) and the Hermes host — VPC peering,
   Tailscale/Cloudflare Tunnel, or a small relay service. See [DEPLOYMENT.md](DEPLOYMENT.md).
2. **Hermes hosting provider/region** — VPS vendor, VM vs. managed container platform. Hermes'
   own docs note it runs from a $5 VPS up to serverless (Modal/Daytona); pick based on the
   Docker-terminal-backend requirement in [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md).
3. **Model provider** for the Hermes deployment(s) — Nous Portal vs. OpenRouter vs. direct
   OpenAI/Anthropic — affects cost, `fallback_providers` chain, and which `model_requirements`
   in [PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md) are actually satisfiable.
   Confirm current pricing/rate limits at decision time, not from this document.
4. **Media generation backend** for the `media` profile's `image_generate`/`text_to_speech`
   tools — not selected in this branch.
5. **Per-mission and per-plan-tier wall-clock timeout values** referenced in
   [FAILURE_RETRY_IDEMPOTENCY.md](FAILURE_RETRY_IDEMPOTENCY.md) — business decision, not
   technical.
6. **Tenant isolation strength tradeoff** — accept the profile-per-capability model in
   [TENANT_ISOLATION.md](TENANT_ISOLATION.md), or require profile-per-tenant for
   high-sensitivity clients, accepting the added operational cost.
7. **External memory provider** (Honcho/Mem0/Hindsight/none) — deliberately left disabled per
   [MEMORY_POLICY.md](MEMORY_POLICY.md); revisit only with an explicit data-residency review.

## Verifications needed against a live/current Hermes deployment before implementation

These were not confirmed from the documentation pages fetched on 2026-08-04 and must be
checked against source (`github.com/NousResearch/hermes-agent`, whatever commit is current at
implementation time) or a live `/v1/capabilities` response before the integration layer is
built:

1. **Exact SSE event name for "run paused, awaiting approval"** on the Runs API — referenced as
   an open item in [API_CONTRACT.md](API_CONTRACT.md) and [EVENT_MODEL.md](EVENT_MODEL.md).
2. **Exact outbound-webhook signature header names** — the fetched page described the *inbound*
   webhook signature scheme in detail (`X-Webhook-Signature-V2` + `X-Webhook-Timestamp`,
   HMAC-SHA256) and stated outbound uses "the same HMAC family" without confirming outbound
   uses identical header names. Verify before implementing webhook signature verification.
3. **Exact config keys for per-profile MCP tool include/exclude glob lists** and
   `agent.disabled_toolsets` — described in prose in the fetched pages; confirm exact YAML
   shape against a running Hermes instance's `config check`/`config migrate` output.
4. **`UsageAndCost` shape returned by the Runs API specifically** (as opposed to the confirmed
   `/v1/chat/completions` and `/v1/responses` `usage` objects) — not directly shown in the
   pages fetched.
5. **Whether `session_search` can be scoped strictly by `X-Hermes-Session-Key`** at the
   implementation level, or only by session/profile more loosely — required to be confirmed
   before enabling `session_search` for any profile, per the hard invariant in
   [TENANT_ISOLATION.md](TENANT_ISOLATION.md).
6. **Current Hermes release** — re-check `github.com/NousResearch/hermes-agent` tags before
   implementation; this review used commit `0845232d764617129d6c6c21a5d9be62dcc05d44` /
   tag `v2026.8.3`, and the project tags roughly weekly.

## Reconciliation work required (found during this branch, not fixed by it)

8. **`packages/hermes/src/http-adapter.ts` and `infrastructure/hermes/` were built against an
   invented, never-verified protocol** (`POST /missions/execute`, custom `X-Hermes-Signature`
   HMAC) because the session that built them had no way to research the real Hermes Agent
   product. This branch's [API_CONTRACT.md](API_CONTRACT.md) documents the real, Bearer-
   authenticated Runs API. A follow-up branch must rewrite the http-adapter to speak it (or
   introduce a new adapter mode) and update/replace `infrastructure/hermes/docker-compose.yml`'s
   `HERMES_IMAGE` assumption with the real `NousResearch/hermes-agent` deployment approach in
   this branch's `infra/hermes/`. See [ARCHITECTURE.md](ARCHITECTURE.md)'s "Relationship to the
   existing `packages/hermes` / `apps/hermes-gateway` scaffolding".
9. **`apps/hermes-gateway`'s 12 restricted tools need an MCP-compatible transport** to be
   consumable by real Hermes as `mcp_stratxcel_*` tools (currently a bespoke bearer-token HTTP
   API at `/tools/:name`) — the tool business logic itself does not need to change. See
   [PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md)'s reconciliation section.
10. **Decide whether dispatch-time tool rejection (the current `STRATXCEL_CONTROLLED_TOOLS`
    mechanism) or run-time `ApprovalRequest` creation (this branch's
    [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md)) is the long-term pattern** for
    `submit_publish_request`/`create_website_change_request` and any newly-sensitive tool —
    both achieve "never executes without StratExcel's say-so," but they're different UX (silent
    rejection vs. a reviewable pending request).

## Credentials that must exist before Test Mission 2 can run for real

- A GitHub token scoped to `Jack160699/stratxcel-automation-platform` with branch-create + push
  permission only (no admin, no other repos) — for the Stratxcel MCP tool server's
  `git_branch_create` tool, not for Hermes directly.
- A Vercel token scoped to Preview deployments for this project, with production-promotion
  requiring a separate, human-triggered action outside Hermes' reach entirely (per
  [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md), production promotion isn't even offered
  as a tool in the test).

None of the above are added to this branch, per the task's explicit constraint against real
production credentials.
