# Skills Plan

## Principle

A "Content Engine" or "SEO Engine" is not a service we build — it is a **Hermes skill**: a
`SKILL.md` (frontmatter + When to Use / Procedure / Pitfalls / Verification sections, per
Hermes' documented `agentskills.io`-compatible format, `user-guide/features/skills.md`,
reviewed 2026-08-04) plus, where needed, a `references/` bundle of Stratxcel-specific
procedure detail (brand voice rubrics, SEO checklist, proposal pricing rules). Skills are
loaded on demand (progressive disclosure: `skills_list()` → `skill_view(name)` →
`skill_view(name, path)`), so a profile only pays the token cost of a skill it's actually
using.

## Ownership model

- **Stratxcel-authored skills** live in this repo under `packages/hermes-contract` companion
  docs today (design only, no `SKILL.md` files ship in this branch — see "Not in this branch"
  below) and get deployed to each profile's `~/.hermes/<profile>/skills/` directory at Hermes
  deploy time, sourced from Stratxcel's own version control — **not** Hermes' community Skills
  Hub. This keeps procedural knowledge for a client-facing business under Stratxcel's own
  review process.
- **Hub-installed skills** (from `skills.sh`, GitHub taps, etc.) are opt-in per profile and
  must pass Hermes' documented security scan (data exfiltration / prompt injection / destructive
  pattern checks) before install; `dangerous`-verdict skills are hard-blocked, non-dangerous
  findings require an explicit `--force`. Default posture: **hub skills disabled** for all
  profiles at launch; enable per-skill only with a documented reason.
- **Agent-authored skills** (Hermes' own `skill_manage` self-improvement loop, which creates
  skills automatically after complex/erroring workflows) are treated as **operational
  learning, not authoritative procedure** — see [MEMORY_POLICY.md](MEMORY_POLICY.md). Set
  `skills.write_approval: true` per profile so agent-created/edited skills land in
  `~/.hermes/pending/skills/` for human review before taking effect, rather than silently
  self-modifying a live profile's procedures.

## Planned skill set (design, not yet authored)

| Skill | Profile(s) | Encodes |
|---|---|---|
| `seo-audit-report` | seo | The exact structure/checklist for Test Mission 1's report |
| `website-preview-flow` | website-development | Branch naming, commit conventions, Preview-deploy-then-report pattern for Test Mission 2 |
| `brand-voice-content` | content | How to read a Brand Brain excerpt and produce on-voice drafts |
| `proposal-pricing-rules` | proposal | Pricing floor/ceiling rules, required disclaimers |
| `crm-followup-etiquette` | crm | Tone/timing rules for drafted follow-ups |
| `mission-handoff-format` | orchestrator | How to structure a plan for delegate_task sub-missions |

## Conditional activation

Hermes supports `requires_toolsets` / `fallback_for_toolsets` (and the tool-level equivalents)
so a skill can declare a hard dependency (e.g., `seo-audit-report` requires the
`mcp_stratxcel_semrush_*` tools) and simply not appear if the profile's toolset doesn't include
them, rather than failing at runtime.

## Not in this branch

No `SKILL.md` files are authored here. This document is the plan; authoring the actual skill
content requires the Brand Brain rubric, SEO checklist, and pricing rules to be pulled from
Stratxcel's existing (untouched, out-of-scope) `app/admin` and `lib/social` implementations —
that's integration work for a later branch, explicitly excluded from this foundation branch's
scope (`docs/hermes/**`, `packages/hermes-contract/**`, `infra/hermes/**` only).
