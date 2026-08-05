# Public Website Sitemap

Design documentation only. Every page below uses the approved design system (`DESIGN_SOURCE_AUDIT.md` §2) — Instrument Sans/JetBrains Mono, `#06080C` canvas, `#3AA0FF` accent — which is a change from the current WebGL "journey" visual language; see `CURRENT_TO_FINAL_MIGRATION_PLAN.md` for how that transition is sequenced. Route status (existing vs. new) is from `ROUTE_AND_REDIRECT_MAP.md`.

Global public nav (desktop, sticky top bar within the shell, not the current cursor-hidden immersive header): `Products` · `Solutions` · `How it works` · `Pricing` · `Work` · `Security` · `About` — right-aligned: `Sign in`, and a primary `Start with Stratxcel` button. Mobile: logo + hamburger → full-screen sheet with the same items stacked, `Sign in` and `Start with Stratxcel` pinned at the bottom of the sheet.

---

### Home — `/` (exists)
- **Purpose**: convert a cold visitor into a demo booking or signup by explaining what Stratxcel does in one scroll.
- **User**: unauthenticated visitor, any awareness level.
- **Sections in order**: hero (one-sentence value prop + primary/secondary CTA) → product overview strip (cards linking to each product, incl. Social Autopilot) → "how it works" 3-step summary → proof (metrics/logos if available, else skip — never fabricate numbers) → security/trust callout linking to `/security` → final CTA band.
- **Primary CTA**: `Start with Stratxcel` → `/signup`.
- **Secondary CTA**: `Book a demo` → `/contact?intent=demo`.
- **Desktop**: full-width sections, sticky nav, hero fills first viewport.
- **Mobile**: same section order, single column, hero condensed to fit above the fold without requiring scroll to find the CTA.
- **Loading/empty/error**: static content, no data fetch — no loading state needed. If a future logos/metrics section is data-backed, it degrades to hidden (not a skeleton) rather than show fabricated placeholder numbers.
- **Nav after click**: `Start with Stratxcel` → `/signup`; product cards → their respective product pages; `Book a demo` → `/contact`.

### Products — `/modules` (exists, retitled "Products" in nav copy)
- **Purpose**: list every Stratxcel product (today: Social Autopilot; future products slot in here) with enough detail to click through.
- **User**: visitor evaluating capability breadth.
- **Sections**: intro line → product grid (each card: name, one-line description, 3 bullet capabilities, "Learn more" link) → cross-sell CTA band.
- **Primary CTA**: per-card `Learn more` → product detail page (e.g. `/social-autopilot`).
- **Secondary CTA**: `Start with Stratxcel` in the closing band.
- **Desktop**: 3-up card grid.
- **Mobile**: 1-up stacked cards.
- **States**: static; if a product has no live page yet, its card shows a `Coming soon` chip (state chip, neutral, per design system) instead of a dead link.

### Solutions — `/use-cases` (exists, retitled "Solutions")
- **Purpose**: organize the same capability by buyer scenario ("for e-commerce," "for local service businesses," etc.) rather than by product.
- **User**: visitor who thinks in terms of their own business problem, not Stratxcel's product names.
- **Sections**: scenario tabs or filter chips → per-scenario narrative card (problem → what Stratxcel does → outcome) → CTA.
- **Primary CTA**: `See how it works` → `/how-it-works`.
- **Secondary CTA**: `Talk to us` → `/contact`.
- **Desktop/mobile**: tabs collapse to a select/accordion on mobile per the responsive rules in `RESPONSIVE_AND_MOBILE_SPECIFICATION.md`.

### How it works — `/how-it-works` (new)
- **Purpose**: explain the operating model (mission → approval → execution → measurement loop) in plain terms before asking for signup.
- **User**: a visitor past the "what is this" stage, evaluating fit/trust.
- **Sections**: numbered step sequence (visually reuses the AI workflow-rail primitive from the design system, applied to marketing rather than live data) → FAQ accordion → CTA band.
- **Primary CTA**: `Start with Stratxcel`.
- **Secondary CTA**: `Read the security overview` → `/security`.

### Pricing — `/pricing` (exists)
- **Purpose**: let a visitor self-qualify budget fit before signup.
- **User**: visitor ready to compare cost.
- **Sections**: plan cards (or usage-based explainer, depending on actual pricing model — not decided by this pass) → comparison table → FAQ → CTA.
- **Primary CTA**: `Start with Stratxcel` per plan.
- **Secondary CTA**: `Talk to sales` → `/contact?intent=sales` for the top tier.
- **Empty/error state**: if pricing data is fetched (vs. hardcoded), a fetch failure shows the static fallback copy with a `Contact us for pricing` CTA rather than a broken table.

### Work / Results — `/work` (new)
- **Purpose**: proof via case studies/results.
- **User**: visitor needing social proof before committing.
- **Sections**: filterable case-study grid → case detail (could be same-page expand or separate route, decided in implementation) → CTA.
- **Primary CTA**: `Start with Stratxcel`.
- **Empty state**: if no case studies exist yet, the page is not published/linked from nav rather than shipping with placeholder testimonials — the voice rules (`CONTENT_AND_UX_VOICE.md`) explicitly forbid fabricated proof.

### Security & Trust — `/security` (new)
- **Purpose**: answer the buyer's security/compliance questions (data handling, RLS, service-role isolation, backups) directly, since this is a legitimate differentiator given the platform's actual RLS-first architecture.
- **User**: technical evaluator or compliance stakeholder.
- **Sections**: architecture summary (plain-English version of the RLS/tenant-isolation model already implemented) → data handling/retention → sub-processor list → contact for security questions.
- **Primary CTA**: `Contact security team` → `/contact?intent=security`.
- **Note**: content here must be reviewed against what's actually true in the running system (RLS coverage, backup cadence) before publishing — this is a business/security-team sign-off item, not something this design pass asserts as fact.

### About — `/about` (new)
- **Purpose**: standard company/story page.
- **Sections**: mission statement → team (if public) → contact.
- **Primary CTA**: `Contact us`.

### Contact / Book a demo — `/contact` (exists, extended)
- **Purpose**: capture a lead, route by intent (`demo`, `sales`, `security`, `support`, general).
- **Sections**: intent-aware form (pre-selects a reason if arriving via `?intent=`) → alternative contact channels → what happens next (sets expectation: "we reply within one business day," or whatever is actually true).
- **Primary CTA**: `Send message` — submits, then a **success state** (not a redirect) confirming receipt with next-step expectation.
- **Error state**: inline field validation + a top-of-form error summary if submission fails, with the entered data preserved (never clear the form on a failed submit).
- **Loading state**: submit button shows a spinner-free "Sending…" label per the design system's "never a spinner over 400ms of content" rule — a determinate or indeterminate processing-bar treatment is preferred if the request meaningfully exceeds 400ms.

### Sign in — `/login` (new)
See `AUTH_AND_ONBOARDING_FLOW.md` for the full flow. Single entry point for both client and staff identities; role is resolved server-side post-auth per `ROUTE_AND_REDIRECT_MAP.md` §3, the page itself never asks "are you staff or a client."

### Start with Stratxcel / Signup — `/signup` (new)
See `AUTH_AND_ONBOARDING_FLOW.md`.

### Forgot / reset password — `/forgot-password`, `/reset-password` (new)
Standard email-link flow. Public-facing; distinct from the existing staff-only `app/admin/reset-password/page.tsx`, which stays as-is for `/admin` (see migration plan for whether these consolidate later).

### Invitation acceptance — `/invite/{token}` (new)
See `AUTH_AND_ONBOARDING_FLOW.md` and the schema caveat in `ROLE_AND_PERMISSION_EXPERIENCE.md` §5.

---

## Footer (every public page)
Product links · Legal (`/privacy`, `/terms`, `/data-deletion` — unchanged routes) · Security · Contact · social/company links if applicable. Footer uses `sx-text-sm`/`sx-text-subtle` per the type scale, never competes visually with page content.
