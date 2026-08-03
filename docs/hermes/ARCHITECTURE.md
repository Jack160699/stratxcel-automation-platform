# Architecture

## Roles

**Stratxcel** (this repo + its Supabase project) is the plane of record:

- Tenants, users, roles, billing, plan limits
- Brand Brain / client authoritative data (facts about each client's business)
- Mission requests, mission status, approvals, audit log
- Credentials vault (Vercel, GitHub, Meta, WhatsApp, Razorpay, Supabase service role, etc.)
- The only system a human ever logs into

**Hermes Agent** (self-hosted, separate host/container) is the execution runtime:

- Runs the tool-calling agent loop for a submitted mission
- Has zero UI surface exposed to end users or clients
- Holds no tenant billing state, no user accounts, no long-term source of truth
- Only reachable by Stratxcel's backend, never by a browser

Hermes is treated as **a powerful, stateless-by-default worker with a really good toolbelt** —
not as a second product. Every capability we'd otherwise build as a bespoke "Content Engine" or
"SEO Engine" becomes a Hermes **profile** (isolated runtime identity) plus a **skill** (packaged
procedure) plus a **restricted toolset** (what it's allowed to touch). See
[PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md).

## Why this split

Hermes already implements, natively, most of what a bespoke engine would have to reinvent
badly: tool-calling loop, context compression, provider fallback, terminal/container
sandboxing, skill authoring, MCP tool federation, cron scheduling, and multi-platform
messaging. Reinventing per-capability engines would mean re-solving sandboxing and
tool-dispatch five to nine times. Instead, Stratxcel owns everything Hermes deliberately does
**not** own: multi-tenant governance, approval gates, billing, and audit — none of which Hermes
is designed to provide (it is fundamentally a single-user-per-profile personal agent runtime;
see [TENANT_ISOLATION.md](TENANT_ISOLATION.md) for how we adapt that to multi-tenant use).

## Component diagram

```
                      ┌─────────────────────────────────────────┐
                      │              Stratxcel (Next.js)         │
                      │                                           │
  Clients / Staff ───▶│  app/admin/*  (existing, untouched)      │
                      │  Supabase: tenants, missions, approvals, │
                      │            audit, credentials vault      │
                      │                                           │
                      │  ┌─────────────────────────────────────┐ │
                      │  │  Hermes Integration Layer (future,   │ │
                      │  │  NOT built in this branch)            │ │
                      │  │  - submits missions                   │ │
                      │  │  - consumes SSE / webhook events      │ │
                      │  │  - resolves approvals                 │ │
                      │  │  - ingests artifact manifests          │ │
                      │  └──────────────┬────────────────────────┘ │
                      └─────────────────┼──────────────────────────┘
                                         │ HTTPS, bearer auth,
                                         │ private network only
                                         ▼
                      ┌─────────────────────────────────────────┐
                      │        Hermes Agent (self-hosted)        │
                      │  Gateway API server  :8642 (loopback/VPN)│
                      │  Profiles: orchestrator, research,       │
                      │  content, seo, website-development, crm, │
                      │  proposal, media, operations              │
                      │                                           │
                      │  ┌───────────────┐   ┌──────────────────┐│
                      │  │ Stratxcel MCP  │   │ Terminal backend  ││
                      │  │ tool server    │   │ (Docker, per-     ││
                      │  │ (brokered,     │   │  mission workspace││
                      │  │  approval-     │   │  container)       ││
                      │  │  gated tools)  │   │                   ││
                      │  └───────────────┘   └──────────────────┘│
                      └─────────────────────────────────────────┘
                                         │
                                         ▼
                         Public web, client sites, sandboxes
                         (never: prod Vercel/Meta/WhatsApp/Razorpay
                          credentials handed to the LLM directly)
```

## Integration surface (summary — full detail in API_CONTRACT.md)

Stratxcel talks to Hermes exclusively through its **API Server** (OpenAI-compatible +
Hermes-native extensions), specifically the **Runs API**, which is purpose-built for
long-running agent turns with progress streaming and mid-run approval:

- `POST /v1/runs` — submit a mission, get a `run_id`
- `GET /v1/runs/{run_id}/events` — SSE stream of progress (`assistant.delta`, `tool.started`,
  `tool.completed`, `run.completed`, `subagent.start/complete`)
- `POST /v1/runs/{run_id}/approval` — resolve a pending approval
- `POST /v1/runs/{run_id}/stop` — cancel
- `GET /v1/runs/{run_id}` — poll (fallback if SSE connection drops)

Hermes' own **outbound webhooks** (signed, configured in `config.yaml`) are used as a
durability backstop, not the primary channel — see [EVENT_MODEL.md](EVENT_MODEL.md) for why
polling/SSE is primary and webhooks are secondary.

Hermes is never given tenant production credentials directly. Sensitive capabilities (deploy,
publish, message, spend) are exposed to Hermes only as tools on a **Stratxcel-run MCP server**
that itself enforces the approval workflow before doing anything irreversible — see
[APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md) and
[SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md).

## Relationship to the existing `packages/hermes` / `apps/hermes-gateway` scaffolding

`origin/main` already contains a prior implementation of the master brief's `AgentRuntimeAdapter`
pattern: `packages/hermes` (disabled/mock/http adapter modes, mission tokens, HMAC request
signing), `apps/hermes-gateway` (the inbound tool server Hermes calls back into for the 12
restricted tools in `packages/hermes/src/tools/contracts.ts`), and `infrastructure/hermes/`
(a docker-compose skeleton). This branch does not touch any of them (out of scope — see
Non-goals). It's important to be explicit about how they relate, because they were built to
**different, unverified assumptions**:

- `packages/hermes/src/http-adapter.ts` calls a hypothetical `POST {baseUrl}/missions/execute`
  endpoint, signing bodies with a custom `X-Hermes-Signature` HMAC scheme
  (`packages/hermes/src/signing.ts`). Its own doc comment states this was "authored in an
  environment without Docker installed" and is "inert... no Hermes instance is running anywhere
  in this environment" — i.e., it was written against an **invented** protocol, never checked
  against Nous Research's actual Hermes Agent, because that research hadn't been done yet.
- `infrastructure/hermes/README.md` says the same thing outright: "the actual Hermes engine is
  a separate project this repo does not own the source of," and its `docker-compose.yml`
  assumes a `HERMES_IMAGE` exposing that same invented `/missions/execute` contract.
- Real Hermes Agent (per this branch's research, [README.md](README.md)) does not expose
  `POST /missions/execute` or verify an `X-Hermes-Signature` header at all — it exposes the
  Runs API under Bearer auth, per [API_CONTRACT.md](API_CONTRACT.md).

**This branch's job is precisely to ground that prior, unverified stand-in in the real
protocol.** The reconciliation itself — rewriting `packages/hermes`'s http-adapter to actually
speak the Runs API, and deciding whether `apps/hermes-gateway`'s 12-tool HTTP server becomes (or
sits behind) an MCP server so real Hermes can federate it as `mcp_stratxcel_*` tools — is a
follow-up branch's work, out of this branch's allowed paths
(`docs/hermes/**`, `packages/hermes-contract/**`, `infra/hermes/**` only). It is recorded as an
explicit item in [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md) so it isn't silently lost.

One thing already built lines up cleanly with no rework needed: `apps/hermes-gateway`'s 12
restricted tools (`get_brand_context`, `request_approval`, `create_human_handoff`, etc.,
enumerated in `HERMES_SKILLS_AND_TOOLS.md`) map directly onto the "Stratxcel MCP tool server"
concept this doc set calls for in [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md) — the
business logic (credential brokering, approval gating, tenant scoping via mission tokens) is
already implemented and tested; only its transport needs to grow an MCP-compatible surface
alongside its existing bearer-token HTTP surface. See
[PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md) for the tool-name mapping.

## What Hermes is not used for

- Not the source of truth for tenant/billing/plan data.
- Not the identity provider or session store for Stratxcel users.
- Not directly exposed to browsers, clients, or the public internet.
- Not trusted to hold or use raw production credentials.
