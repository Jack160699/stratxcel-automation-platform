# Supabase Data & RLS Map

## Connected access (this session)

The Supabase MCP connector is authenticated to org `glyavnovrqlwlgaojfos` ("Jack160699's Org"), which contains exactly **one** project:

| Project | Ref | Status |
|---|---|---|
| `newspaper-motion` | `giiuqshoconjbpiueasp` | ACTIVE_HEALTHY (Postgres 17.6.1) |

This is the **Jan Darpan** database. Per the brief's non-negotiable rules, it is out of scope and was not queried for schema/table contents beyond confirming its identity — no `list_tables`, `execute_sql`, or `get_advisors` calls were made against it, specifically to avoid any chance of Jan Darpan data appearing in this repository's discovery output.

## The actual StratExcel database is not reachable via MCP in this session

`stratxcel-automation-platform`'s `.env.local` and its linked Supabase CLI project ref (`supabase/.temp/project-ref`) both point to project ref **`uccqlgeghkwzujeeymua`**, which does **not** appear in `list_projects` for the connected org. This means either:

- it lives under a different Supabase organization/account than the one this MCP session is authenticated to, or
- the connected account lacks membership on it.

**Consequence:** schema and RLS inspection for the real StratExcel database could not be done live via MCP tools this session. What is known instead comes from the file-based migration history already in the repo:

`stratxcel-automation-platform/supabase/migrations/`:
- `20260727210513_social_autopilot_schema_delta.sql`
- `20260727210853_oauth_states.sql`
- `20260727211405_workflows.sql`
- `20260727214817_grant_role_privileges.sql`
- `20260728120000_social_agent_run_events.sql`

All dated 2026-07-27/28 — this schema is new and was very likely stood up specifically for the Social Autopilot module, consistent with the "dedicated project separation from Jan Darpan" the brief calls for having already happened once (see `.env.local.bak-before-stratxcel-switch`, which still points at `giiuqshoconjbpiueasp` — proof the site used to share Jan Darpan's database and was already migrated off it before this engagement started).

`ai-automation-system/backend/supabase/migrations/` (separate history, unconfirmed which project it targets — likely a **third** Supabase project, not `uccqlgeghkwzujeeymua` and not `giiuqshoconjbpiueasp`, given the naming convention and April-2026 dates predate the July "stratxcel switch"):
- `20260423183000_founder_execution_state.sql`
- `20260423_phase_d_analytics.sql`
- `20260424_ceo_morning_drafts_permissions.sql`
- `20260428_messages_persistence_columns.sql`

## Required before any Supabase-touching migration work

1. Confirm, from the Vercel project env vars for `stratxcel`, `ai-os-ai-os`, `ai-os`, and `stratxcel-os` (dashboard, not MCP — reading Vercel env var **values** was not attempted in this session as they may contain secrets), which Supabase project ref each actually points at in production.
2. If `uccqlgeghkwzujeeymua` sits under a different Supabase account, that account needs to either be connected to this session's Supabase MCP connector, or all further schema/RLS verification must go through the Supabase CLI with the account owner running `supabase login` locally.
3. Do not run any Supabase MCP write tool (`apply_migration`, `execute_sql`, `create_project`, `create_branch`, etc.) in this session against any project — the only project reachable is Jan Darpan's, and none of this engagement's schema work belongs there.

No RLS policies were read or evaluated in this document, since no in-scope project was queryable. This must be produced in a follow-up once Supabase access is corrected.
