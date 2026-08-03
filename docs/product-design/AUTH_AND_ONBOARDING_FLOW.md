# Authentication & Onboarding Flow

Design documentation only. Builds directly on `ROLE_AND_PERMISSION_EXPERIENCE.md` (identity model) and `ROUTE_AND_REDIRECT_MAP.md` (redirect table) — this document is the moment-by-moment flow between them.

## 1. Sign in — `/login`

Single form (email + password, plus whatever OAuth providers are already configured for Supabase auth — not re-decided here). No "I am staff / I am a client" toggle: the same form authenticates everyone, and the redirect table in `ROUTE_AND_REDIRECT_MAP.md` §3 decides the destination server-side after auth succeeds. This is deliberate — asking the user to self-identify their role before login is both bad UX and a trust boundary that shouldn't live in the client.

- **States**: default → submitting ("Signing in…", no spinner per motion rules, disabled submit) → success (immediate redirect, no interstitial) → error (wrong credentials: generic "Incorrect email or password" — never confirm which field was wrong; account locked/rate-limited: specific, actionable message per the voice rules — what happened, what it affects, what to do).
- **Secondary links**: `Forgot password?` → `/forgot-password`. `New to Stratxcel? Start here` → `/signup`.
- **Mobile**: identical form, full-width fields, no layout changes needed at this simplicity level.

## 2. Sign up — `/signup`

Account creation only — this is intentionally separated from the 6-step onboarding in §3. A signup creates a Supabase auth user; it does **not** create a tenant. Immediately after signup succeeds, the redirect table sends a brand-new user (0 tenant memberships, no admin row) to `/app/onboarding`.

- **Fields**: email, password, name. Email verification handling follows whatever Supabase auth already does for this project — not redefined here.
- **States**: default → submitting → error (email already registered: "An account already exists for this email." with a `Sign in instead` link — never a generic failure that hides this) → success → straight into onboarding, no separate "check your email" dead-end unless email verification is actually required by the existing auth config.

## 3. Onboarding — `/app/onboarding`, six steps

This is the first thing a brand-new signup sees, and the only path that creates a tenant (the `createTenant()` server-side call already exists at `lib/tenants/repository.ts` and `POST /api/platform/tenants`; onboarding is the polished front door to that same operation, not a new backend).

Rendered as a single-flow wizard, not six separate routes — one URL (`/app/onboarding`), step tracked in local/URL state, so a refresh mid-flow doesn't strand the user. Progress uses the design system's workflow-rail primitive (dot–line–dot, current step highlighted).

| Step | Purpose | Primary input | Can skip? |
|---|---|---|---|
| 1. Account | Confirm identity (name, role at the business) — most of this is already known from signup, so this step is short, mostly a confirmation screen | Display name, phone (optional) | No — but pre-filled, so effectively a single click for most users |
| 2. Business profile | What the business is | Business name, slug (auto-generated from name, editable — reuses the existing slug-uniqueness validation already in `CreateClientForm.tsx`), industry, website URL | No |
| 3. Goals | What they want Stratxcel to do first | Multi-select of outcome-oriented goals (e.g. "grow social following," "automate WhatsApp replies") — drives which product/module gets surfaced first in the Command Center, not a hard gate | Yes — "I'll figure this out later" |
| 4. Brand setup | Seed the Brand Brain (already an existing concept in `/admin/social/brand`) | Brand voice/description, logo upload, key products — this is the first write to whatever Brand Brain storage already backs `/admin/social/brand` | Yes — can be completed later from `/app/brand` |
| 5. Plan / payment or onboarding selection | Choose plan or an assisted-onboarding path | Plan card selection, or "talk to a specialist first" branch that exits into a booking flow instead of self-serve | Depends on business model — **this step's actual mechanics (self-serve billing vs. sales-assisted) is a business decision this design pass does not resolve** — the UI accommodates either |
| 6. Workspace creation | The actual `createTenant()` call, then land in `/app` | None — this step is a confirmation + progress state while the tenant is provisioned | No |

- **Step transitions**: `Continue` (primary, accent) and `Back` (ghost) at the bottom of every step; `Continue` is disabled until required fields on that step validate.
- **Error state**: a failed `createTenant()` call at step 6 (e.g. slug collision surfaced from the existing `409` handling in `CreateClientForm.tsx`) drops the user back to step 2 with the conflicting field highlighted — never a dead-end error page for a recoverable validation failure.
- **Loading state**: step 6's provisioning wait uses the determinate/indeterminate processing-bar primitive from the design system, not a blank screen.
- **Abandonment**: if a user leaves mid-onboarding and returns later, they resume exactly where they left off (their auth session already exists with 0 tenants, so the redirect table sends them straight back to `/app/onboarding`, and step progress is restored from whatever was already saved — steps 2/4 write real data as they're completed, so nothing already submitted needs to be re-entered).

## 4. Invitation acceptance — `/invite/{token}`

For someone invited to an existing tenant (`inviteMember()` in `lib/tenants/repository.ts`).

- **Case A — invitee has no Stratxcel account yet**: land on `/invite/{token}` while logged out → shows who invited them and to what workspace ("Jane Doe invited you to join Acme Retail as an Operator") → `Create account & join` → runs signup inline, then completes the membership activation, then lands directly in `/app` for that tenant (**skips onboarding entirely** — they're joining an existing workspace, not creating one).
- **Case B — invitee already has an account**: land on `/invite/{token}` while logged out → `Sign in to accept` → after login, same activation → `/app`.
- **Case C — already logged in when the link is opened**: skip straight to the confirmation ("Accept invitation to join Acme Retail as an Operator?") → `Accept` → `/app` for that tenant.
- **Expired/invalid/already-used token**: a plain state page — what happened (token invalid or expired), what to do (contact the person who invited you, or `Sign in` if they think they already accepted it). Never a generic 404.
- **Schema dependency**: as noted in `ROLE_AND_PERMISSION_EXPERIENCE.md` §5, this flow assumes invitations have a distinguishable "pending" state before full membership. If the current schema always creates a full `tenant_members` row immediately on invite (no pending state), Case A/B's "invitee has no account yet" path needs a token-based side table or claim mechanism that does not exist today — **this is the one piece of this entire document that may require a schema decision, flagged here and in the final report.**

## 5. Logout

Available from the user menu in the shared shell (`SHARED_SHELL_SPECIFICATION.md`) on both `/app` and `/admin`. Ends the session, redirects to `/` (public home), not `/login` — a logged-out visitor belongs on the public site, not staring at a login form.
