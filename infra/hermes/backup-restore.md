# Backup / Restore

See [docs/hermes/DEPLOYMENT.md](../../docs/hermes/DEPLOYMENT.md#backup--restore) and
[docs/hermes/MEMORY_POLICY.md](../../docs/hermes/MEMORY_POLICY.md) for why backup priority is
deliberately uneven across `~/.hermes/<profile>/`.

## What to back up, and priority

| Path | Priority | Why |
|---|---|---|
| `.env` | High | Secrets — losing it means re-provisioning API keys, not data loss, but breaks the deployment until redone. Back up encrypted, separately from everything else. |
| `config.yaml` | High | Small, hand-authored, easy to lose track of tuning (toolset allowlists, model routing). |
| `state.db` (SQLite) | Medium | Session/transcript history. Stratxcel's own audit log is the authoritative record of mission outcomes (docs/hermes/OBSERVABILITY.md); this is operationally useful for debugging, not authoritative. |
| `memories/`, `skills/` | Low | Explicitly non-authoritative per docs/hermes/MEMORY_POLICY.md — safe to lose and let regenerate. Back up only if Stratxcel-authored skills (docs/hermes/SKILLS_PLAN.md) are deployed there without also being in this repo's version control (they should always also be in version control — treat a skills/ backup as a convenience, not a safety net). |

## Procedure (example — not automated by this branch)

```bash
# Stop the gateway first — SQLite backup mid-write risks a corrupt copy.
systemctl stop hermes-gateway   # or: docker compose stop

tar czf hermes-backup-$(date +%F).tar.gz \
  --exclude='memories' --exclude='skills' \
  -C /home/hermes/.hermes/<profile> .env config.yaml state.db

# Encrypt before shipping off-host — .env is in this archive.
gpg --encrypt --recipient <backup-key-id> hermes-backup-$(date +%F).tar.gz

systemctl start hermes-gateway
```

## Restore

```bash
gpg --decrypt hermes-backup-<date>.tar.gz.gpg | tar xzf - -C /home/hermes/.hermes/<profile>
systemctl start hermes-gateway
./healthcheck.sh
```

## What restoring does NOT bring back

Mission history, approvals, and audit trail live in Stratxcel's own database, not here — a full
Hermes host loss does not lose any tenant-authoritative record (docs/hermes/MEMORY_POLICY.md).
It loses in-flight runs (docs/hermes/FAILURE_RETRY_IDEMPOTENCY.md's dead-letter path handles
this) and Hermes' own operational memory/skills (safe to lose by design).
