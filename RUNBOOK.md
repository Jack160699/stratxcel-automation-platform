# Stratxcel Platform Operational Runbook

**Last Infrastructure Audit:** 7 August 2026
**Production Project:** Vercel project `stratxcel` (`stratxcel.in` / `www.stratxcel.in` / `stratxcel.vercel.app`)
**Supabase Production Project:** `stratxcel` (`uccqlgeghkwzujeeymua`, Region: South Asia - Mumbai)

---

## 1. Everyday Development & Verification Commands

```bash
npm install                     # Workspace setup across packages/* and apps/*
npx tsc --noEmit                 # Full monorepo static typecheck
npm run lint                     # ESLint verification across app and packages
npm run test:foundation          # 21 core foundation logic & payment state tests
npm run test:security            # RLS coverage & SQL privilege guard suite (58 migrations)
npm run test:social              # Social Autopilot crypto & provider integration tests
npm run test:razorpay-mode       # Payment test-mode isolation verification
npm run build                    # Next.js 16 (Turbopack) production build
```

---

## 2. Health Monitoring & Runtime Verification

- **Production Health Endpoint:** `GET /api/health`
  - Returns HTTP 200 JSON with status `healthy`, UTC ISO timestamp, and integration modes summary (`supabaseConfigured: true`, `razorpayMode: "disabled"`, `whatsappMode: "disabled"`, `hermesMode: "disabled"`).
- **Runtime Logs Inspection:**
  - Run `npx vercel logs stratxcel-5j6rnxdyc-jack160699s-projects.vercel.app` (or active deployment URL) via Vercel CLI.
  - Or inspect Vercel Dashboard → Project `stratxcel` → Logs.

---

## 3. Production Incident Response

1. **Classify Severity:**
   - **P0 (Outage / Security / Data Risk):** Unhandled 5xx flood, RLS policy bypass, or payment mode mutation.
   - **P1 (Degraded Feature):** Social posting/worker failure or API rate limit throttling.
2. **First Action:** Query production runtime logs via Vercel CLI (`npx vercel logs`).
3. **Fail-Closed Guarantees:**
   - Cron endpoints reject calls lacking `Authorization: Bearer <CRON_SECRET>` (401).
   - Payment webhooks reject invalid HMAC signatures.
   - Razorpay production mode is strictly locked to `disabled`.

---

## 4. Deployment & Rollback

- **Vercel Instant Rollback:**
  - Navigate to Vercel Dashboard → Deployments → Select previous successful READY deployment → Click **Promote to Production**.
  - Or run: `npx vercel rollback <deployment-id>`.
- **Git Main Branch Rollback:**
  - `git revert <commit-sha>` on `main` and push. Never force-push `main`.

---

## 5. Supabase Migration Rules & Verification

- **Additive Only:** NEVER modify an already-applied migration file in `supabase/migrations/`.
- **Verification Command:** Run `npx supabase migration list` after linking project (`uccqlgeghkwzujeeymua`) to ensure 100% 1:1 match between local and remote migrations.
- **Applying New Migrations:**
  - Place additive SQL files in `supabase/migrations/YYYYMMDDHHMMSS_name.sql`.
  - Validate with `npm run test:security` before applying.

---

## 6. Database Backups & PITR Recovery

- **Physical Backups (WALG):** Active (`true`) in region `South Asia (Mumbai)`. Supabase takes physical backups automatically.
- **Point-in-Time Recovery (PITR):** Currently `false` (Standard tier).
  - *Owner Action Required for PITR:* Go to Supabase Dashboard → Database → Backups → Enable Point-in-Time Recovery.

---

## 7. Auth Configuration & Redirect Checklist

- **Site URL:** `https://stratxcel.in`
- **Redirect Allow List:**
  - `https://stratxcel.in/*`
  - `https://www.stratxcel.in/*`
  - `https://stratxcel.vercel.app/*`
  - `http://localhost:3000/*`
- **Route Protections:**
  - `/admin/*` protected server-side via Supabase auth token revalidation (`proxy.ts`).
  - Password reset flows validate recovery state tokens and reject unauthenticated mutations.

---

## 8. Secret Rotation Protocol

1. **Vercel Environment Secrets:**
   - Update variable name in Vercel Dashboard → Environment Variables (or `npx vercel env add <NAME>`).
   - Trigger a fresh production deployment to pick up rotated secrets.
2. **Supabase Service Role / Anon Keys:**
   - Rotate in Supabase Dashboard → Project Settings → API.
   - Update `SUPABASE_SERVICE_ROLE_KEY` in Vercel production environment variables.

---

## 9. Payment Safety Constraints

- `RAZORPAY_INTEGRATION_MODE` MUST remain `disabled` in production environment.
- Production transactions, refunds, and live webhook processing must fail closed unless explicitly enabled via owner authorization.
- Verify isolation: `npm run test:razorpay-mode`.
