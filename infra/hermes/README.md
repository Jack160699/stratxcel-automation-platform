# infra/hermes

Deployment skeleton for a self-hosted Hermes Agent instance, grounded in the real, documented
Hermes Agent product (see [docs/hermes/README.md](../../docs/hermes/README.md) for sources
reviewed). **Nothing here is deployed by this branch** — no container is built or run, no host
is provisioned.

## Relationship to `infrastructure/hermes/` (existing, untouched)

`origin/main` already has `infrastructure/hermes/` — a docker-compose skeleton written before
the real Hermes Agent product had been researched, against an invented protocol
(`HERMES_IMAGE` exposing a hypothetical `POST /missions/execute`). This directory
(`infra/hermes/`, different path, not a rename) is the protocol-accurate replacement design:
Hermes Agent has **no official Docker image** (confirmed against
`getting-started/installation`, reviewed 2026-08-04 — installation is a shell/PowerShell
installer script, not a container pull), so `Dockerfile` here builds one from the documented
installer instead of assuming an image exists. Reconciling the two directories (retiring or
rewriting `infrastructure/hermes/`) is follow-up work — see
[docs/hermes/MANUAL_REQUIREMENTS.md](../../docs/hermes/MANUAL_REQUIREMENTS.md) item 8.

## Files

| File | Purpose |
|---|---|
| `Dockerfile` | Builds a Hermes Agent image from the official installer script — see file header for why there's no official image to pull instead |
| `docker-compose.example.yml` | Single-profile gateway, loopback-bound, Docker terminal backend for tool-call sandboxing |
| `.env.example` | Variable **names** only — no real secret is committed, ever |
| `healthcheck.sh` | Polls `GET /health` with the bearer token |
| `backup-restore.md` | What to back up, what's safe to lose (see docs/hermes/MEMORY_POLICY.md) |
| `reverse-proxy.example.conf` | nginx example for the private-network-only exposure model in docs/hermes/DEPLOYMENT.md |
| `hermes.service.example` | systemd unit shape for process supervision |

## Before using any of this for real

Read [docs/hermes/DEPLOYMENT.md](../../docs/hermes/DEPLOYMENT.md) and
[docs/hermes/MANUAL_REQUIREMENTS.md](../../docs/hermes/MANUAL_REQUIREMENTS.md) first — several
decisions (hosting provider, private-network mechanism, model provider) are explicitly left
unresolved there and must be made before any of these files are used against a real host.
