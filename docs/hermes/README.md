# Hermes Agent Integration — Foundation

Status: **foundation only** — docs, contracts, and an infra skeleton. No application route in
`stratxcel-site` calls Hermes yet. Nothing here executes against production.

## What this is

Stratxcel is evolving into the **tenant, governance, billing, approval, audit, and
client-control plane** for an agency automation platform. [Hermes Agent](https://github.com/NousResearch/hermes-agent)
by Nous Research is adopted as the **central mission execution runtime** — the thing that
actually runs tool-calling agent loops, browses the web, edits files, and calls external
services on Stratxcel's behalf.

This means: **we do not build separate autonomous engines for Content, SEO, Websites, CRM,
Proposals, Research, or Operations.** Each of those is a Hermes **profile** (isolated config +
memory + skills) with an **allowlisted toolset**, driven by missions that Stratxcel submits,
governs, and audits. See [PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md).

## Sources reviewed

All architectural claims in this doc set are grounded in the following, fetched on
**2026-08-04**:

| Source | Reference |
|---|---|
| Repository | [github.com/NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) |
| Reviewed commit | `0845232d764617129d6c6c21a5d9be62dcc05d44` (`main`, authored 2026-08-03) |
| Latest tagged release | `v2026.8.3` — "Hermes Agent v0.20.0 (2026.8.3)", published 2026-08-03 |
| Docs site | [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs/) |
| Key pages fetched | `user-guide/features/api-server`, `user-guide/configuration`, `user-guide/security`, `user-guide/features/tools`, `user-guide/features/skills`, `user-guide/features/memory`, `user-guide/features/mcp`, `user-guide/features/hooks`, `user-guide/messaging/webhooks`, `developer-guide/architecture` |

Do **not** extend this doc set from prior/remembered Hermes knowledge. Hermes Agent ships
near-daily releases (5 tags in the 34 days before this review); re-verify against the sources
above — or newer ones — before implementation, and update the table when you do. Anything
below that could not be confirmed from a fetched page is explicitly flagged as **UNVERIFIED**
and listed in [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md) rather than asserted as fact.

## Document map

| Doc | Answers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How Stratxcel and Hermes fit together, and why |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Where Hermes runs, how it's reached, how it's hardened |
| [API_CONTRACT.md](API_CONTRACT.md) | Exact Hermes endpoints/protocol Stratxcel will call |
| [EVENT_MODEL.md](EVENT_MODEL.md) | SSE + webhook event types and delivery guarantees |
| [PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md) | Profiles, allowed/forbidden tools per capability |
| [SKILLS_PLAN.md](SKILLS_PLAN.md) | How Content/SEO/CRM/etc. become Hermes skills, not engines |
| [TENANT_ISOLATION.md](TENANT_ISOLATION.md) | How client A's mission never touches client B's data |
| [MEMORY_POLICY.md](MEMORY_POLICY.md) | What Hermes is allowed to remember, and for whom |
| [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md) | What credentials Hermes gets (and never gets) |
| [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md) | How sensitive actions get gated on human approval |
| [ARTIFACT_FLOW.md](ARTIFACT_FLOW.md) | How mission outputs get from Hermes into Stratxcel |
| [OBSERVABILITY.md](OBSERVABILITY.md) | Logging, tracing, audit trail |
| [FAILURE_RETRY_IDEMPOTENCY.md](FAILURE_RETRY_IDEMPOTENCY.md) | Timeouts, retries, cancellation, dead-letter |
| [END_TO_END_TEST_PLAN.md](END_TO_END_TEST_PLAN.md) | The two safe first integration tests |
| [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md) | Decisions/credentials only a human can make |

## Relationship to prior work on `origin/main`

`origin/main` already has a substantial prior implementation of the master brief's Hermes
adapter pattern (`packages/hermes`, `apps/hermes-gateway`, `infrastructure/hermes/`) — built
against an invented, never-verified protocol because that session couldn't research the real
Hermes Agent product. This doc set is the missing research, and exists to ground that prior
work in reality, not to replace it wholesale. See
[ARCHITECTURE.md](ARCHITECTURE.md#relationship-to-the-existing-packageshermes-appshermes-gateway-scaffolding)
for the specific mismatch and [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md) items 8–10 for
what a follow-up branch needs to reconcile.

## Non-goals of this branch

- No route in `app/`, `app/admin`, or Social Autopilot calls Hermes.
- No production credentials are added anywhere in this branch.
- No merge to `main`, no deploy, no change to the live WhatsApp EC2 instance.
- `packages/hermes-contract` is a standalone TypeScript package — it is not imported by any
  application code yet.
