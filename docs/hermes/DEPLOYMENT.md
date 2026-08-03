# Deployment

## Recommended topology

**Self-hosted, single Hermes gateway process per environment (staging / production), reached
only over a private network.** Not Nous Portal-hosted, not multi-tenant-by-default.

```
Stratxcel Vercel deployment (public internet)
        │  server-side only — no browser ever calls Hermes directly
        ▼
Private network (VPC / WireGuard / Tailscale — decide at implementation, see
MANUAL_REQUIREMENTS.md)
        │
        ▼
Hermes gateway :8642  (API_SERVER_HOST=127.0.0.1 or private interface, never 0.0.0.0 on a
                        publicly routable host without a reverse proxy + firewall in front)
        │
        ▼
terminal.backend: docker   ← every mission's tool calls execute inside a disposable,
                              resource-capped container, not on the Hermes host's bare OS
```

Rationale: Hermes' own security docs (fetched 2026-08-04, `user-guide/security`) state that
running with a container terminal backend is the documented production recommendation, and
that the dangerous-command approval system is explicitly *skipped* inside containers because
"the container itself serves as the security boundary." We adopt that: the Hermes **host**
process is never exposed publicly, and everything the agent actually executes (shell,
file writes, code execution) happens inside a locked-down, ephemeral container per mission.

## Reaching Hermes from Vercel

Vercel serverless functions cannot join an arbitrary private VPC by default. Two viable
options, to be decided in [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md):

1. Put the Hermes host behind a reverse proxy (see `infra/hermes/reverse-proxy.example.conf`)
   on a private DNS name, reachable only via an allowlist of Vercel's egress IPs + mutual TLS
   or a signed-request scheme, bearer token required regardless.
2. Route Stratxcel → Hermes traffic through a small relay (e.g., Vercel → Cloudflare Tunnel /
   Tailscale Funnel → Hermes host), keeping the Hermes port itself never publicly bound.

Either way: **bearer token required on every request, non-negotiable**, network restriction is
defense-in-depth on top of auth, not a replacement for it.

## Environment separation

- One Hermes deployment for staging (used by the two safe test missions in
  [END_TO_END_TEST_PLAN.md](END_TO_END_TEST_PLAN.md)), fully separate host/container from any
  future production Hermes deployment.
- Staging Hermes never holds production credentials — see
  [SECRETS_AND_SECURITY.md](SECRETS_AND_SECURITY.md).
- No profile/config for a "production" Hermes is created in this branch. This branch only ships
  a documented skeleton (`infra/hermes/docker-compose.example.yml`) — nothing is deployed.

## Process supervision

Hermes recommends running as a long-lived gateway process (`hermes gateway --profile <name>
--port <port>`), one process per profile. `infra/hermes/hermes.service.example` shows the
systemd-unit shape for supervising that process (auto-restart, non-root user, resource limits)
without committing to a specific host provider.

## Backup / restore

Per-profile state that must be backed up if we want mission history durability beyond
Stratxcel's own DB copy of results:

- `~/.hermes/<profile>/config.yaml`, `.env` (secrets — encrypt at rest, see SECRETS doc)
- `~/.hermes/<profile>/state.db` (SQLite — sessions, FTS index)
- `~/.hermes/<profile>/memories/` and `skills/` (see MEMORY_POLICY.md — treat as
  **non-authoritative**, safe to lose and regenerate; Stratxcel's DB is the source of truth for
  anything that must survive)

`infra/hermes/backup-restore.md` documents the procedure. Because Stratxcel treats Hermes
memory as advisory rather than authoritative (see MEMORY_POLICY.md), backup cadence for
`memories/`/`skills/` can be lower priority than `state.db` and `.env`.

## Health checking

`infra/hermes/healthcheck.sh` polls `GET /health` and `GET /health/detailed` (documented
endpoints) with the bearer token, suitable for a container `HEALTHCHECK`, a systemd
`ExecStartPost`, or an external uptime monitor.

## What is explicitly NOT decided by this branch

- Concrete hosting provider/region for Hermes (VPS vendor, k8s vs. VM, etc.)
- Concrete private-network mechanism (VPC peering vs. Tailscale vs. Cloudflare Tunnel)
- Concrete container image / base OS for the Hermes host itself
- Whether staging Hermes is always-on or spun up per test run

These are flagged in [MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md).
