# Research Engine V1

Grounded web evidence for StratExcel Research / Strategy / SEO / Content / Social / Website / Ads / Growth / Sales / Conversion / Hermes.

## Stacking note

This Research PR is stacked on temporary branch `integration/v1-research-foundation`
(PR #47 workforce wiring + PR #45 AI runtime merge). It must **not** merge to `main`
directly. After PR #45 and #47 land, rebase `feat/v1-research-engine` onto `main` and
retarget the PR.

## Architecture

```
mission
  → research.web (Workforce)
    → Research adapter (workforce-core)
      → @stratxcel/search-discovery research module
        → @stratxcel/ai-runtime (RESEARCH | SEO_RESEARCH)
          → Gemini Google Search grounding / OpenAI web_search
        → normalize sources + claim mapping + quality gate
        → optional bounded verify fetch (SSRF-safe crawler guards)
        → mission_artifacts (research_evidence + research_summary)
      → capability receipt
```

Hermes path:

```
Hermes specialist
  → Workforce research.web (budget + tenant + metering)
  → evidence / summary artifacts
  → attach_research_evidence (mission event trail only; no native browser tools)
```

## Request contract

`ResearchRequest` (validated in `packages/search-discovery/src/research/validate.ts`):

- tenantId, missionId, requestId, question, purpose?
- taskClass: `RESEARCH` | `SEO_RESEARCH`
- geography?, language?, freshnessDays?
- maxSources (1–20), preferred/blocked/required domains
- primarySourcesPreferred, requireWebEvidence, requireClaimCitations
- correlationId

Bounds prevent unlimited crawl/search (question length, domain list length, freshness,
verified fetch caps, excerpt size).

## Evidence model

`ResearchResult` includes:

- status (`PASS` | `INSUFFICIENT_EVIDENCE` | …)
- summary, claims[{id,text,sourceIds,sourceSupportStatus,statementKind}]
- sources[{url,canonicalUrl,domain,provider,verification,sourceType,…}]
- evidenceArtifactIds, summaryArtifactId
- provider/model/usage/selectionReceipt

Confidence is **never** invented from LLM prose. Only omitted/null unless a
deterministic provider field exists.

## Provider-neutral citation format

AI Runtime exposes `AIWebEvidence`:

- sources[] (url, title, domain, provider, stable source ids)
- citationSupports[] (text/segment + **sourceIds**; optional sourceIndices)
- searchQueries[]
- searchAttribution metadata (Gemini entry-point length only — never render HTML)

**Provider-native citationSupports are authoritative** for claim→source linkage.
Model structured output supplies semantic claim fields only (`id`, `text`,
`statementKind`) and must **not** invent internal ids such as `gemini_src_0`.

Provider-specific parsing stays inside adapters:

- `parseGeminiGroundingMetadata` — groundingChunks / groundingSupports / webSearchQueries
- `parseOpenAIWebEvidence` — url_citation annotations + web_search_call sources

Research business logic never parses raw Gemini/OpenAI JSON.

## Search tool cost accounting

Token cost alone understates Research COGS. AI Runtime `AIUsage.toolUsage`
records conservative upper-bound search-tool units:

- Gemini: `webSearchQueries` × documented post-free-quota rate ($14 / 1,000)
- OpenAI: `web_search_call` count × central web-search tool rate

Provider-project free quotas are **not** allocated per tenant. Upper-bound
accounting protects budget gates; provider dashboards remain the invoice source.

`estimatedCostUsd` = token/media estimate + tool upper-bound (no double-count).

## Retrieval vs claim support

`verification=verified` means the URL was safely fetched and content passed
retrieval checks (`retrievalVerifiedSourceCount` in receipts). It does **not**
mean an independent fact audit. Claim support comes from provider citation
mapping (`sourceSupportStatus`).

## Gemini grounding path

When task policy allows and `requireWebEvidence=true`, AI Runtime enables
`tools: [{ google_search: {} }]`. Adapter normalizes returned groundingMetadata.
If text returns without usable sources and requireWebEvidence is set →
`INSUFFICIENT_EVIDENCE` (not a fake PASS). Escalation may follow routing policy.

## OpenAI web-search path

When policy allows, `{ type: "web_search" }` is enabled. Citations normalize into
the same `AIWebEvidence`. **OpenAI live calls are deferred** (owner wallet).
Unit tests use fake HTTP fixtures only.

## Search Console distinction

`research.serp` is **not** a public SERP scraper. Search Discovery already has a
tenant-scoped Google Search Console reader for owned-property queries/clicks/
impressions. Workforce `research.serp` remains `NOT_CONFIGURED` until that path is
production-bound with real connection/property authorization. Never invent rankings.

## Source normalization + SSRF

`normalizeResearchUrl` / `assertResearchFetchTarget`:

- http/https only
- reject file/data/javascript/ftp/localhost/private/link-local/cloud-metadata
- lowercase host, strip fragment, drop tracking params, dedupe
- DNS-checked via existing `assertPublicHttpTarget`

Optional verify fetch: max 5–8 sources, timeout, redirect limit, byte cap,
content-type allowlist, no cookies/credentials.

## Prompt-injection defense

Public web content is UNTRUSTED DATA. Trusted system preamble separates control
instructions from wrapped `<<<UNTRUSTED_WEB_SOURCE>>>` excerpts. Web content cannot
invoke Workforce, publish Social, send WhatsApp, mutate CRM, deploy, charge, or
reveal secrets. Adversarial tests cover injection patterns.

## Quality gate

Deterministic evaluator (`evaluateResearchQuality`) — not “LLM says 9/10”:

- non-empty summary
- requireWebEvidence ⇒ ≥1 real source
- real URLs, claim-source coverage when required
- unsupported claims flagged; conflicting sources preserved as disagreement

## Artifact model

Reuses `mission_artifacts` only (`NEW_MIGRATIONS = NONE`):

- `research_evidence` — URL, title, domain, provider, queries, verification, safe excerpt, hash, claim ids
- `research_summary` — question, summary, claim ids, evidence ids, provider/model, freshness, handoff metadata

Idempotency keys: mission + request + canonical URL (+ query). Full copyrighted pages
are not stored.

## Workforce flow

Capability `research.web` → provider `research-grounded-web` (`AVAILABLE` statically).
Runtime probe returns `NOT_CONFIGURED` / `WAITING_CONFIGURATION` when AI keys/hosts
are missing. Receipt includes query, source counts, artifact ids, provider/model,
fallback, estimated cost, timestamp — no secrets.

## Hermes flow

Native Hermes web/browser tools remain disabled. `attach_research_evidence` verifies
artifact belongs to the same mission/tenant, then appends a mission event. Hermes
does not bypass tenant, budget, usage ledger, or Workforce evidence rules.

## Budget / metering

Production Research uses `createTenantAIRuntime` with `productionBillable=true`
(no `internalUnmetered`). Task classes `RESEARCH` / `SEO_RESEARCH` use existing
routing/budget policy. Exhaustion fails closed.

## Live smoke

- Default tests: fake HTTP only
- Optional: `RESEARCH_LIVE_SMOKE_TEST=1` (not run in this workstream)
- Expected: `LIVE_RESEARCH_SMOKE: NOT_RUN`, `OPENAI_LIVE_STATUS: DEFERRED_OWNER_WALLET`

## Known operational dependencies

- Gemini API key for primary grounded research
- OpenAI wallet for fallback (currently deferred)
- Supabase service role for usage ledger + mission_artifacts
- Search Console OAuth/property for future research.serp

## UI / compliance note

Preserve enough provider attribution metadata for a future citation UI. Do not
blindly render provider-returned HTML (e.g. Gemini searchEntryPoint).
