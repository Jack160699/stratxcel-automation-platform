# Creative Studio Architecture

`@stratxcel/creative-studio` is StratExcel’s production creative package. It turns a mission brief + Brand Brain slice into concepts, platform copy, art direction, image/video/carousel artifacts, critique/revision loops, and an exactly-bound final artifact — without inventing unavailable media capabilities.

## Principles

1. **GENERATED ≠ APPROVED** — candidates must pass fidelity, critique, and binding before becoming final.
2. **No fake media** — unavailable image/video providers return `WAITING_CAPABILITY` with empty candidates (never placeholder URIs sold as real).
3. **Creator ≠ critic** — creative work is reviewed by an independent quality critic role.
4. **Claim safety** — guaranteed ROI/results and prohibited claims are blocked; critique returns `REJECTED` (does not throw) for claim violations during review.
5. **Exact binding** — final artifacts fingerprint media + copy + concept + art direction + provenance; silent substitution is forbidden.
6. **Tenant isolation** — cross-tenant reference assets throw; provenance is tenant-scoped.
7. **Package composition preserved** — starter/growth/business/image_30 mixes never collapse to text-only.

## Pipeline

```
Brief (creative_director)
  → Concepts (3+ distinct archetypes)
  → Platform copy / script / longform
  → Art direction
  → Reference selection (mission → campaign → brandBrain; never unrelated auto)
  → Image candidates (provider or WAITING_CAPABILITY)
  → Quality + product fidelity
  → Critique + revision loop (cap → HUMAN_REVIEW / NEEDS_ATTENTION)
  → Best-candidate selection (weighted)
  → Media provenance
  → Final artifact binding
  → Optional carousel / video plans (video may WAITING_CAPABILITY)
```

Entry point: `runCreativeStudioPipeline` in `src/pipeline/run-studio.ts`.

## Module map

| Area | Path | Responsibility |
|------|------|----------------|
| Brief | `src/brief/creative-director.ts` | `createCreativeBrief`, `assertClaimsAllowed` |
| Concepts | `src/concepts/concept-developer.ts` | 3+ archetypes, distinctness, selection |
| Copy | `src/copy/copywriter.ts` | Platform copy, adaptation, scripts, longform |
| Art | `src/art/art-direction.ts` | Composition, fidelity, typography plan |
| Brand | `src/brand/context.ts` | Brand Brain slices via workforce-core |
| Image | `src/image/*` | Providers, budget, quality scores, fidelity |
| References | `src/references/library.ts` | Scoped selection + cross-tenant guard |
| Provenance | `src/provenance/media-provenance.ts` | Internal + customer-safe provenance |
| Typography | `src/typography/renderer.ts` | Deterministic sha256 layout fingerprints |
| Carousel | `src/carousel/pipeline.ts` | Plan, compose, QA, distinct pages |
| Video | `src/video/pipeline.ts` | Storyboard, audio, production with fallbacks |
| Critique | `src/critique/creative-critic.ts` | Independent critic + blocked-claim REJECTED |
| Revision | `src/revision/loop.ts` | Cycle state, cap escalation, image revise |
| Selection | `src/selection/best-candidate.ts` | Weighted compare/select |
| Binding | `src/binding/final-artifact.ts` | Exact bind + anti-substitution |
| Packages | `src/package/compositions.ts` | Catalog mixes (8+4, 20+5, 40+10, 30) |
| Pipeline | `src/pipeline/run-studio.ts` | End-to-end orchestration |

## Capability honesty

| Capability | Configured | Not configured |
|------------|------------|----------------|
| Image generation | `MockImageProvider` / real provider returns candidates | `WAITING_CAPABILITY`, `candidates: []` |
| Video / reel | `setVideoProviderStatus("available")` | `WAITING_CAPABILITY`, no fake URI |
| Blocked provider | `BlockedImageProvider` | Always waiting |

Budget helpers: `createStudioBudget`, `assertBudgetAllows`. Overspend / max-candidate violations surface as `BUDGET_EXCEEDED`.

## Package compositions

| Tier | Mix | Units |
|------|-----|-------|
| starter / launch | 8 image + 4 reel | 12 |
| growth | 20 image + 5 reel | 25 |
| business | 40 image + 10 reel | 50 |
| image_30 | 30 image | 30 |

`assertPackageCompositionPreserved` guards against silent mix changes.

## Provenance

`createMediaProvenance` stores internal prompt/provider detail under `internalOnly`. `toCustomerSafeProvenance` strips internals before customer surfaces. `assertTenantIsolation` fails closed on tenant mismatches.

## Testing

```bash
npm run test:creative-studio
```

Harness: `packages/creative-studio/src/__tests__/creative-studio.test.ts` (Node `--experimental-strip-types`, mocks only).

## Dependencies

- `@stratxcel/brand-brain` — brand content types
- `@stratxcel/workforce-core` — `compileBrandContextSlice`, `critiqueCandidate`, quality policy

Do not edit `packages/workforce-core/src/capabilities/**` from this package’s ownership.
