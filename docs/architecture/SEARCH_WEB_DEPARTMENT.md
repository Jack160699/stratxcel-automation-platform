# Search & Web Department

WorkforceCore specialist workflows for the **seo** and **website** departments.

## Scope

- SEO research, keyword maps, SERP analysis (evidence-backed only)
- Technical SEO audits via `@stratxcel/search-discovery`
- SEO article briefs/drafts with mandatory evidence for factual claims
- Internal linking from known page inventory
- SEO publish-request boundary (no production publish from generation alone)
- Website audit that preserves strong pages (`redesignEntireSite: false`)
- Page briefs, targeted changes, landing pages, and full-site drafts via `@stratxcel/websites-and-domains`
- Preview binding to exact deploy candidates
- Deployment-request boundary (no production deploy from plan/model text alone)
- Local SEO service+city pages and NAP notes (`gbpConnected` only when verified)

## Module layout

`packages/workforce-core/src/search-web/`

| File | Responsibility |
|------|----------------|
| `types.ts` | Artifact contracts + `KeywordOpportunity` |
| `capability-gate.ts` | SERP/publish gates + tenant scope |
| `keyword-map.ts` | Keyword + content-gap maps from real evidence |
| `serp.ts` | SERP analysis (blocks when provider unavailable) |
| `seo-audit.ts` | Technical SEO → workforce findings |
| `article-pipeline.ts` | Brief/draft with factuality + stuffing guards |
| `internal-linking.ts` | Known-page link plans |
| `publish-boundary.ts` | `seo_publish_request` + mutation rejection |
| `website-audit.ts` | Preserve-strong-pages audits |
| `website-generation.ts` | Page briefs, changes, landing drafts |
| `preview-deploy.ts` | Preview bind + deploy-request boundary |
| `local-seo.ts` | Local service/city + NAP/GBP recommendations |
| `department-workflows.ts` | SEO/Website stage graphs |
| `run-seo.ts` / `run-website.ts` | Department orchestrators |
| `index.ts` | Public re-exports |

## Safety invariants

1. **Never fabricate** search volumes or SERP rankings.
2. **`research.serp` PLANNED/unavailable** → `WAITING_CAPABILITY` / `RESEARCH_REQUIRED`.
3. **No invented URLs** in internal link plans (`InventedUrlError`).
4. **Cross-tenant sites rejected** (`cross_tenant_site_rejected`).
5. **Article factual claims** must cite evidence ids from the brief.
6. **Generation ≠ publish/deploy authorization** (`productionPublishAuthorized: false`, `productionDeployAuthorized: false`).
7. **Preview binds** `boundDeployCandidateId = deploy_candidate_${revisionId}`.
8. Request stages never include `seo.publish` or `website.deploy`.

## Handoffs

Orchestrators use the exact handoff API:

```ts
createDepartmentHandoff({
  tenantId, missionId, planId, fromStage, toStage, objective,
  artifactIds, evidenceIds, decisions, unresolvedQuestions, constraints, qualityStatus
})
```

## Planning integration

`seo_content` and `website_conversion` workflow focuses expand into multi-stage pipelines that keep business-growth stage ids (`s_research`, `s_seo`, `s_website`, …) while aligning outputs with Search & Web artifacts. SEO plans do not require Social.

## Tests

```bash
node --experimental-strip-types packages/workforce-core/src/__tests__/search-web-department.test.ts
```
