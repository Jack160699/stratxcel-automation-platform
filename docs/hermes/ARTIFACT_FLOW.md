# Artifact Flow

## Principle: manifest, not blind paths

A mission never hands Stratxcel a bare filesystem path or a "trust me, it's at X" URL. Every
output is described by an `ArtifactManifest` (see `packages/hermes-contract`): a typed list of
artifact entries, each with a stable ID, content type, size, checksum, and a **retrieval
method** — never an implicit assumption that Stratxcel can reach into the Hermes container's
filesystem directly.

## Retrieval methods (design)

Given Hermes' documented tool surface, an artifact entry's retrieval method is one of:

- `inline` — small text/JSON content (e.g., an SEO report body) returned directly in the
  manifest, below a size ceiling (avoids a second round-trip for the common case).
- `hermes_file` — a path inside the mission's own Docker workspace (`read_file`-reachable by
  Hermes tools), which Stratxcel's integration layer fetches via a dedicated, checksummed pull
  step — never executed as a trusted path without the checksum matching.
- `external_url` — for artifacts a brokered MCP tool already pushed somewhere Stratxcel
  controls (e.g., `mcp_stratxcel_content_draft_save` already wrote to Stratxcel's own storage
  and the manifest just references that record's ID) — the common case for anything a
  `sensitive`-adjacent or write-capable tool produces, since those tools are Stratxcel's own
  code and can write directly to Stratxcel's storage instead of round-tripping through Hermes'
  filesystem at all.

## Checksum verification

Every non-`inline` entry carries a `sha256` checksum computed by Hermes/the tool at write time.
Stratxcel's integration layer must verify the checksum after retrieval and reject (mark the
mission artifact `corrupt`, not silently accept) on mismatch, before the artifact is surfaced
anywhere a human or downstream automation would trust it.

## Why this matters here specifically

Test Mission 1 (SEO/conversion report) and Test Mission 2 (branch + Preview URL) are the first
two real artifacts this integration will produce — see
[END_TO_END_TEST_PLAN.md](END_TO_END_TEST_PLAN.md). Both are designed to use
`external_url`/`inline` manifests respectively (a stored report record; a Preview deployment
URL that Vercel itself serves, not something pulled from the Hermes container), so the first
real usage never depends on the less-trusted `hermes_file` path at all. `hermes_file` is
designed in now so it's not an afterthought when a profile genuinely needs to hand back a
generated binary (e.g., `media` profile image output) later.

## Manifest is part of the audit record

`ArtifactManifest` is persisted verbatim to Stratxcel's audit log alongside the mission's
`HermesExecutionEvent` stream (see [OBSERVABILITY.md](OBSERVABILITY.md)) — what was produced is
as auditable as what was done to produce it.
