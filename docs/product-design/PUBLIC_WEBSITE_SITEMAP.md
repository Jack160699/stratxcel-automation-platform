# Public Website Sitemap — V1 Stable

Authoritative public IA for Stable V1. Implementation source of truth:
`lib/reporting/site.ts` (`PUBLIC_ROUTES`, `DISALLOWED_PATHS`).

## Canonical host
`https://www.stratxcel.in`

## V1 public sitemap (indexed)
- `/`
- `/modules` — What Stratxcel does
- `/use-cases` — Solutions
- `/social-autopilot`
- `/pricing`
- `/how-it-works`
- `/about`
- `/security`
- `/contact`
- `/terms`
- `/privacy`
- `/data-deletion`

## Excluded from sitemap / Stable public discovery
- `/app/*`, `/admin/*` — authenticated
- `/audit`, `/login`, `/signup`, auth flows — non-index acquisition infrastructure
- `/agents`, `/system` — internal architecture; Stable redirects to V1 pages; owner-admin Beta may preview
- `/work` — no genuine published proof yet
- `/products`, `/solutions` — redirects only (list targets instead)

## Public header (desktop)
What Stratxcel does · Solutions · How it works · Pricing · Security
Right: Sign in · Start with Stratxcel

Never link unauthenticated visitors into `/app/*` product routes.

## Footer
Product / Solutions / Trust / Legal — About & Contact live here; Business Audit remains a conversion path in Trust, not primary nav clutter.

## Promotion rule
A page joins the public sitemap only when it is sellable V1 customer-facing acquisition or trust content that returns 200 without redirect and does not expose internal architecture.
