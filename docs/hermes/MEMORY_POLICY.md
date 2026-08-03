# Memory Policy

## Two kinds of "memory" — kept strictly separate

### 1. Authoritative client data (Stratxcel-owned, source of truth)

Brand facts, business rules, prior approvals, pricing floors, CRM records — everything a
mission needs to know about a specific tenant to do its job correctly. This lives **only** in
Stratxcel's Supabase project and is injected into a mission as **fresh context on every
submission** (part of `SubmitMissionRequest`), never left for Hermes to "remember" between
missions. Consequence: if Hermes' memory is wiped, reset, or compromised, no authoritative
client fact is lost or exposed — it never lived there.

### 2. Learned operational memory (Hermes-owned, advisory only)

Hermes' native memory system — `MEMORY.md` (~800 tokens, environment/convention notes) and
`USER.md` (~500 tokens, preference notes), plus its skill-authoring loop and SQLite FTS5
session search (`user-guide/features/memory.md`, reviewed 2026-08-04) — is procedural: "how
this profile tends to do things well," not "what is true about tenant X." It is:

- **Never used as a source of truth for a mission decision.** A mission's system context always
  comes from Stratxcel's injected bundle, not from Hermes recalling a prior conversation.
- **Reviewable and resettable** per profile without data loss, because nothing authoritative
  lives there.
- **Write-approval gated**: `memory.write_approval: true` and `skills.write_approval: true` per
  profile config, so Hermes-authored memory/skill changes are staged (documented as
  `~/.hermes/pending/`) for human review rather than taking effect silently — matching the
  approval posture in [APPROVAL_AND_HANDOFF.md](APPROVAL_AND_HANDOFF.md).

## Session-key scoping

`X-Hermes-Session-Key: {tenantId}:{profile}` (see [TENANT_ISOLATION.md](TENANT_ISOLATION.md))
scopes which operational memory/session-search a run can draw from. This bounds — but per the
isolation doc's residual-risk note, does not cryptographically guarantee — cross-tenant leakage
through Hermes' own memory layer.

## Configuration posture (per profile, in `config.yaml`)

```yaml
memory:
  memory_enabled: true          # operational memory on — advisory only, per above
  user_profile_enabled: false   # USER.md models a single human; not meaningful for a
                                 # multi-tenant service profile — disable
  write_approval: true          # stage, don't auto-commit, memory writes

skills:
  write_approval: true          # stage agent-authored/edited skills for review
  guard_agent_created: true     # scan agent-created skills for dangerous patterns
```

`user_profile_enabled: false` is a deliberate deviation from Hermes' personal-agent defaults:
`USER.md` is designed to model one human's preferences across sessions, which has no correct
meaning for a profile serving many different tenants' missions.

## External memory providers

Hermes documents optional external memory providers (Honcho, Mem0, Hindsight, others). **None
are enabled in this branch.** Adding one would mean tenant-adjacent data leaving Stratxcel's
own Supabase project into a third system — that's a data-residency and vendor decision for a
human, not something this foundation branch decides. See
[MANUAL_REQUIREMENTS.md](MANUAL_REQUIREMENTS.md).
