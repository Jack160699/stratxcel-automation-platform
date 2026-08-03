# Secrets and Security Model

## The core rule

**Hermes never holds a raw production credential for any external system Stratxcel manages on
a tenant's behalf.** Not Vercel, not GitHub write access beyond a scoped bot, not Meta, not
WhatsApp, not Razorpay, and never the Supabase service-role key. This is enforced structurally,
not by prompt instruction.

## How: the Stratxcel MCP tool server

Every capability that would otherwise require a real credential is exposed to Hermes as a tool
on a Stratxcel-run MCP server (`mcp_stratxcel_*` namespace, per Hermes' documented MCP tool
prefixing, `user-guide/features/mcp.md`, reviewed 2026-08-04). That server:

- Holds the real credentials itself (in Stratxcel's own secret store — Vercel env vars /
  Supabase Vault, not in any Hermes `.env`).
- Looks up the right credential **by `tenantId`** from the mission context on each call — a
  mission never carries a credential in its prompt or context bundle, only an opaque
  `tenantId` the MCP server resolves server-side.
- Enforces the approval gate itself (see
  [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md)) for any tool marked `sensitive: true` in
  its manifest, so approval-bypass would require compromising the MCP server, not just crafting
  a clever prompt to Hermes.

Hermes' documented MCP env-passthrough model reinforces this: "Hermes does not blindly pass
your full shell environment. Only explicitly configured `env` plus a safe baseline are passed
through" to stdio MCP subprocesses — the Stratxcel MCP server, run separately, follows the same
discipline for whatever *it* shells out to, if anything.

## What lives in Hermes' own `.env` (per profile)

Only what Hermes itself needs to function:

- `API_SERVER_KEY` (bearer token Stratxcel uses to call Hermes)
- Model provider key(s) (Nous Portal / OpenRouter / OpenAI / Anthropic — whichever is chosen,
  see [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md))
- The Stratxcel MCP server's own connection secret (a distinct, narrowly-scoped credential —
  not a Stratxcel admin credential)

Never: Supabase service-role key, Vercel deploy tokens, Meta/WhatsApp tokens, Razorpay keys.
`infra/hermes/.env.example` lists names only, values never committed, per the task's explicit
constraint.

## Layered controls Hermes already provides (adopted, not reinvented)

Per `user-guide/security.md` (reviewed 2026-08-04), Hermes ships defense-in-depth we build on
top of rather than duplicate:

- **Protected-path write blocks**: `~/.ssh/`, `~/.aws/`, `~/.kube/`, `/etc/sudoers`, `.env*`
  files are always blocked from agent writes.
- **Env-var filtering in `execute_code`/`terminal`**: variables matching
  `KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PASSWD|AUTH` are stripped from what those tools can see
  — an extra backstop even though we don't place real production secrets in Hermes' env at all.
- **SSRF protection**: blocks fetches to RFC 1918 ranges, loopback, link-local, and cloud
  metadata endpoints (`169.254.169.254`, `metadata.google.internal`) by default — relevant
  because a `research`/`seo` profile's `web_extract`/`browser_navigate` tools are internet-
  facing by design.
- **Container hardening** (Docker terminal backend): all Linux capabilities dropped except a
  minimal conditional set, `no-new-privileges`, process-count cap, `nosuid`/`noexec` tmpfs — see
  [DEPLOYMENT.md](DEPLOYMENT.md).
- **Command-approval system** (smart/manual/off) for dangerous shell patterns — set to `manual`
  for any profile *not* using the Docker backend; per Hermes' own docs, this check is skipped
  inside containers because the container is the boundary, so for `website-development` and any
  other container-backed profile, container hardening is the primary control.
- **Supply-chain scanner** for known-compromised Python package versions, lazy-install
  allowlisting.

## What this branch adds on top

- The Stratxcel MCP tool server design (credential brokering + approval enforcement) — **design
  only in this branch**, not implemented; `infra/hermes/` ships a skeleton, not a running
  server.
- Per-profile toolset allowlists (see
  [PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md)) so a profile can't even *see* a
  sensitive tool it has no business calling, regardless of prompt.
- The explicit rule that production promotion, publishing, messaging, spending, and refunds are
  `ApprovalRequest`s by construction — see
  [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md).

## Secrets that must never be committed (and are not, in this branch)

Verified before commit: `git diff --stat` for this branch touches only `docs/hermes/**`,
`packages/hermes-contract/**`, `infra/hermes/**`; `infra/hermes/.env.example` contains variable
names with placeholder values only (e.g. `API_SERVER_KEY=changeme`), never a real key.
