# End-to-End Test Plan

Two missions, deliberately chosen to be safe: read-only first, then a reversible write with a
hard production gate. Neither is executed by this branch — this document specifies them so a
future branch (with the real Hermes deployment and integration layer) can run them as the first
proof the architecture works.

## Test Mission 1 — read-only SEO/conversion report on stratxcel.in

**Profile**: `seo`.

**Input** (`SubmitMissionRequest`): `{ tenantId: "stratxcel-internal", profile: "seo", brief:
"Analyse stratxcel.in and produce a read-only SEO/conversion report", targetUrl:
"https://stratxcel.in" }`.

**Allowed tools**: `web_search`, `web_extract`, `browser_navigate`, `browser_snapshot`,
read-only Semrush MCP tools (`domain_overview`, `site_audit`, `keyword_research`) — see
[PROFILE_AND_TOOL_POLICY.md](PROFILE_AND_TOOL_POLICY.md). No write-capable tool is even visible
to this profile.

**Success criteria**:
- Mission reaches `run.completed` with no tool call outside the allowed read-only set (verified
  against the persisted `HermesExecutionEvent` log, not just trusted from the final report).
- `ArtifactManifest` contains one `inline` or `external_url` entry: a structured report
  (findings + prioritized recommendations, no code, no diffs).
- Zero rows in Stratxcel's `ApprovalRequest` table for this mission (nothing sensitive was
  attempted).
- Zero writes to any external system — this is checkable because `stratxcel.in` production is
  untouched by construction (no write tool was ever offered to the profile).

**Why first**: proves mission submission, event streaming, artifact manifest retrieval, and
audit logging end-to-end with the smallest possible blast radius — no tool exists in this
mission's toolset that *could* cause harm, so a bug in the integration layer can't accidentally
cause one.

## Test Mission 2 — branch + Vercel Preview for a harmless change

**Profile**: `website-development`.

**Input**: `{ tenantId: "stratxcel-internal", profile: "website-development", brief: "Create a
branch with a harmless, clearly-labeled change (e.g., a code comment or a non-visible copy
tweak) and open a Vercel Preview deployment. Do not promote to production.", repo:
"Jack160699/stratxcel-automation-platform" }`.

**Allowed tools**: `terminal`/`patch`/`read_file` (inside the mission's Docker workspace only),
`mcp_stratxcel_git_branch_create`, `mcp_stratxcel_vercel_preview_deploy`.
`mcp_stratxcel_vercel_promote_production` is **not in this profile's toolset at all** for this
test — not just "not called," structurally absent, so the test cannot accidentally promote even
under a prompt-injection scenario.

**Success criteria**:
- A new branch exists on the remote (e.g., `hermes-test/<mission-id>`), containing only the
  described harmless change.
- A Vercel Preview URL is returned in the `ArtifactManifest` (`external_url` entry) and is
  reachable.
- Production (`stratxcel.in` live deployment) is unchanged — verified by diffing production's
  currently-deployed commit before and after the test.
- If the mission's plan ever includes a production-promotion step, it must appear as an
  `ApprovalRequest` in Stratxcel's DB with status `pending` at test end, **never** auto-approved
  or auto-executed — this branch of the test explicitly proves the gate holds even though the
  tool isn't offered; the profile toolset absence is the primary control, the approval gate is
  the backstop if that were ever misconfigured.

**Why second**: proves write-capable tool use, container-workspace isolation, and — critically —
that the production-promotion gate cannot be bypassed, using a change with genuinely zero
user-facing impact if something goes wrong.

## Explicit non-goals of both tests

- Neither test involves a client tenant's real data, credentials, or live site.
- Neither test enables any messaging (WhatsApp/email/social) or spend-adjacent tool.
- Neither test is run by this branch — running them requires the Hermes deployment
  ([DEPLOYMENT.md](DEPLOYMENT.md)) and integration layer ([API_CONTRACT.md](API_CONTRACT.md))
  to exist first, both explicitly out of scope here.
