# Tenant Isolation

## The honest starting point

Hermes Agent, as documented, is fundamentally a **single-user personal-agent runtime** with
multi-instance support via **profiles** (isolated `HERMES_HOME`: config, `.env`, memory,
skills, sessions — per `developer-guide/architecture.md` and `user-guide/configuration.md`,
reviewed 2026-08-04). It has no native concept of "tenant" or per-request multi-tenant
isolation within a single profile. We do not pretend otherwise; we design around it.

## Chosen model for v1: workspace + session-key isolation within capability-scoped profiles

Stratxcel is an agency platform with a **managed, bounded set of client tenants** (not
open self-serve signup at scale), which makes a stronger isolation guarantee affordable than it
would be for a consumer SaaS:

1. **Profiles are scoped by capability, not by tenant** (orchestrator, research, content, seo,
   website-development, crm, proposal, media, operations — see
   [PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md)), because Hermes profiles are a
   process/filesystem-level construct and running one profile per tenant per capability does
   not scale operationally as tenant count grows.
2. **Every mission runs in its own disposable Docker workspace**, `docker_volumes` mounted at
   `/workspaces/{tenantId}/{missionId}` only — no mission's container can see another
   tenant's or another mission's files, regardless of profile.
3. **Every mission sets `X-Hermes-Session-Key: {tenantId}:{profile}`** — Hermes echoes this
   back and uses it to scope transcript/memory recall, so session search
   (`session_search`/FTS5) within a run cannot surface another tenant's conversation history.
4. **Tenant-authoritative data is never persisted into Hermes at all** — it's injected fresh
   as mission context per run (see [MEMORY_POLICY.md](MEMORY_POLICY.md)) and Hermes' own
   long-term memory (`MEMORY.md`/`USER.md`/skills) is treated as profile-level *operational*
   learning, reset/audited per tenant boundary rather than trusted to self-segregate tenant
   facts.

## Explicit residual risk (flag, don't hide)

Because memory/session-search inside a single profile is not natively tenant-partitioned
beyond the session-key scoping in point 3, **this is not a cryptographic isolation guarantee** —
it is defense-in-depth (workspace isolation + session-key scoping + no authoritative data ever
entering Hermes memory). If/when tenant count or sensitivity requires stronger isolation, the
next step is one Hermes profile (and likely one container host) per tenant tier or per
high-sensitivity tenant, at the cost of the operational complexity described in
[DEPLOYMENT.md](DEPLOYMENT.md). This tradeoff is recorded rather than resolved here — see
[MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md).

## What must never happen (hard invariants)

- A mission for tenant A must never receive a Docker volume mount that includes tenant B's
  workspace path.
- A mission for tenant A must never be issued credentials scoped to tenant B (this is enforced
  by the Stratxcel MCP tool server looking up credentials by `tenantId` from the mission
  context, not by anything Hermes-side — see
  [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md)).
- Hermes' cross-session `session_search` tool, if enabled for a profile, must be scoped by the
  session-key such that it cannot return another tenant's prior mission transcript. If this
  cannot be confirmed against the deployed Hermes version's actual `session_search`
  implementation, disable `session_search` for that profile rather than assume isolation.
