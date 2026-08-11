# AI Workforce Master E2E

**Status:** Deterministic integration harness against WorkforceCore
**Package:** `@stratxcel/workforce-core` → `src/e2e/`
**Runner:** `packages/workforce-core/src/__tests__/company-ops-e2e.test.ts`

## Safety

Mocks **only** for:

| Kind | Purpose |
|------|---------|
| `social_publish` | Simulated social mutation |
| `whatsapp_send` | Simulated WhatsApp send |
| `ads_publish` | Simulated ads |
| `website_deploy` | Simulated deploy |
| `payment_charge` | Simulated charge (never real) |

No real customer-visible mutation. Receipts always `realMutation: false`.

## Core scenarios (planBusinessGrowth)

1. **Audit customer** — diagnostic path; no unpurchased media execution; no subscription activation
2. **CRM bottleneck** — strong traffic + weak follow-up → CRM/WhatsApp/Sales/Conversion/Analytics (not Social primary)
3. **Paid content** — package → strategy/creative/media → simulated publish receipt
4. **SEO customer** — research/article path → simulated publish
5. **Website customer** — diagnosis → landing/QA → simulated deploy receipt
6. **Unavailable capability** — reel stage `WAITING_CAPABILITY` / `NEEDS_ATTENTION` (not fake success)

## Also proven

- Two-tenant isolation (Brand Brain, artifacts, integrations, leads, approvals, usage, reports, receipts)
- Mission recovery idempotency (timeout, restart, retry, quality revision, approval wait, capability restoration)
- Cost unknown handling
- Customer success readiness + ops blocked mission view
- Finance cannot charge; payment failure surfaces without mutate
- Engineering host-tool denial
- Plan exhaustion + historical mission reconstruction

## Scripts

```bash
node --experimental-strip-types packages/workforce-core/src/__tests__/company-ops-e2e.test.ts
npm run test:workforce-e2e
npm run test:workforce-core
```

Harness uses current WorkforceCore planners/fixtures — do not cherry-pick parallel department branches prematurely.
