# StratXcel V1.5 Digital Presence Cleanup & Connector Stability Architecture

**Date:** 2026-08-18  
**System:** StratXcel Business & Integrations Engine  
**Release:** V1.5  
**Status:** Completed & Verified  

---

## 1. Root Cause for Instagram Instability
1. **Public Discovery UI Override:** The Business Profile (`/app/brand`) Digital Presence section rendered static presence cards reading solely from `BrandBrainContent` without querying the relational `social_accounts` or `social_tokens` tables. Even when Instagram was authenticated via OAuth, the crawler's discovered public handle caused the UI to render `Found publicly` and `Connect`.
2. **Upsert Constraint Mismatch:** During onboarding, a placeholder row in `social_accounts` was provisioned with a synthetic ID (`acct_instagram_...`). When real Meta OAuth completed with the real IG user ID (`1784...`), the existing unique conflict target (`owner_id, platform, provider_account_id`) failed to update the tenant's primary row, leaving the active tenant query in a disconnected or stale state.

---

## 2. Root Cause for Facebook Instability
1. **Unlinked Tenant Queries:** Facebook Page connections were upserted with `owner_id`, but multi-tenant queries on `/api/platform/integrations/status` explicitly filtered by `tenant_id = tenantId`. If `tenant_id` was not bound during early onboarding callbacks, the query returned `setup_required`.
2. **Missing Customer Disconnect Endpoint:** Customers had no API mechanism in `/app/brand` or `/app/integrations` to disconnect or reset a corrupted Page token, trapping the UI in an unresolvable state.

---

## 3. Root Cause for YouTube Instability
1. **Erroneous Platform Mapping in OAuth Callback:** In `app/api/social/oauth/[provider]/callback/route.ts` (line 256), a legacy ternary mapped `canonicalPlatformKey === "google_business" ? "youtube" : canonicalPlatformKey`. This created cross-contamination where Google Business authorizations wrote `youtube` records into `social_accounts`.
2. **Google Refresh Token Vaulting:** Google OAuth only returns a `refresh_token` upon initial consent or when `prompt=consent` is forced. If re-authenticating without `prompt=consent`, previous tokens were overwritten with empty refresh tokens.

---

## 4. Root Cause for GA4 Instability
1. **Property Selection vs Account OAuth Distinction:** Google OAuth authentication succeeded, but `search_google_connections` required an explicit `ga4_property_id` selection. The UI conflated "OAuth Connected" with "GA4 Property Connected", causing confusion when an account was connected but no GA4 property was selected yet.
2. **Callback Return Path Rejection:** The Google OAuth callback route (`/api/platform/search/google/callback`) only permitted return paths to `["/app", "/app/integrations", "/app/search"]`. Authorizations initiated from `/app/brand` were ignored and forcibly redirected to `/app/search`.

---

## 5. Root Cause for Search Console Instability
1. **Property Discovery Errors Treated as Revocation:** When Google Search Console property listing failed (e.g. temporary rate limit or lack of verified sites), the connection status was marked `error` or `disconnected` rather than preserving the valid vaulted refresh token and alerting the user to verify domain ownership on Google Search Console.

---

## 6. Existing Connector Architecture

The platform uses three primary persistence tables backed by Supabase PostgreSQL:
1. **`public.social_accounts`**: Stores provider account ID, username, display name, permissions, and tenant linkage.
2. **`public.social_tokens`**: Encrypted access token and refresh token storage (using AES-256-GCM packed ciphertext).
3. **`public.search_google_connections`**: Stores Google vaulted refresh token references, Search Console site URL, and GA4 property ID.
4. **`public.whatsapp_phone_bindings`**: Stores verified E.164 phone numbers and active webhook bindings.
5. **`public.brand_brains` & `brand_brain_versions`**: Versioned business profile intelligence and public channel URLs.

---

## 7. Canonical Status Model (`lib/connectors/canonical-status.ts`)

We implemented a single, authoritative resolver `getTenantDigitalPresence(supabase, tenantId)` that computes three deterministic states:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      CANONICAL STATE HIERARCHY                         │
├────────────────────────────────────────────────────────────────────────┤
│ 1. STATE 3 — OPERATIONALLY READY (CONNECTED)                           │
│    OAuth connection exists, tokens valid, tenant linked, API working.  │
│    Actions: [Manage] [Reconnect] [Disconnect]                          │
├────────────────────────────────────────────────────────────────────────┤
│ 2. STATE 2 — REAUTH REQUIRED / ERROR                                   │
│    OAuth connection exists, but token is revoked, expired, or invalid. │
│    Actions: [Reconnect] [Disconnect]                                   │
├────────────────────────────────────────────────────────────────────────┤
│ 3. STATE 1 — DISCOVERED PUBLICLY                                       │
│    Public website/social link found by crawler, but NO OAuth exists.   │
│    Actions: [Connect]                                                  │
├────────────────────────────────────────────────────────────────────────┤
│ 4. NOT CONNECTED                                                       │
│    No connection and no public link found.                             │
│    Actions: [Connect]                                                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Database Changes & Constraint Hardening
- Hardened `upsertConnectedAccount` in `lib/social/repositories/accounts.ts` to look up existing rows by `(tenant_id, platform)` before inserting, ensuring reconnects update the active tenant account rather than creating orphaned duplicates.
- Added encrypted token clearing in `social_tokens` upon disconnect.

---

## 9. OAuth Changes
- In `app/api/social/oauth/[provider]/callback/route.ts`:
  - Corrected platform mapping (`google_business` maps to `google_business`, not `youtube`).
  - Added direct tenant linkage using `verified.payload.tenantId`.
- In `app/api/platform/search/google/callback/route.ts`:
  - Added `/app/brand` to `ALLOWED_RETURN_PATHS`.
- In `app/api/social/oauth/[provider]/connect/route.ts`:
  - Preserved `tenantId` and redirect destination in signed HMAC-SHA256 OAuth state.

---

## 10. UI Changes
1. **Business Profile (`/app/brand`):**
   - Completely replaced static text presence links with the interactive `DigitalPresenceCards` component.
   - Strictly renders the 8 V1.5 platforms: **Website, Google Business, Instagram, Facebook, YouTube, Google Analytics (GA4), Google Search Console, WhatsApp**.
   - Removed customer-facing **LinkedIn, X, and Threads**.
2. **Connectors (`/app/integrations`):**
   - Added live `[Disconnect]` functionality for all OAuth providers.
   - Replaced optimistic guesswork with server ground truth from `/api/platform/integrations/status`.

---

## 11. Auto-Fixes
- Added `POST /api/platform/integrations/disconnect` route allowing customers to revoke/reset any connection.
- Added safe auto-reconciliation on status fetch to provision unlinked onboarding metadata into relational tables.
- Added post-OAuth URL cleanup (`oauth=success` stripped from query string after state rehydration).

---

## 12. Regression Tests
- `lib/social/__tests__/connector-stability.test.ts` (NEW): **6/6 PASS**
  - Test 1: V1.5 Canonical Platforms Set Invariant (excludes LinkedIn, X, Threads).
  - Test 2: Public Discovery vs Authentic OAuth Connection Resolution.
  - Test 3: Full Lifecycle (Connect -> Persist -> Reload -> Disconnect -> Reconnect).
  - Test 4: Google Search Console & GA4 Persistence.
  - Test 5: Multi-Tenant Connection Isolation.
  - Test 6: WhatsApp Verified Phone Binding.
- `lib/social/__tests__/connector-persistence-rehydration.test.ts`: **PASS**
- `lib/social/__tests__/connector-production-hardening.test.ts`: **PASS**
- `test:audit-flow`: **ALL PASS**
- `test:audit-automation`: **ALL PASS**

---

## 13. Remaining Manual Provider Actions
- Ensure `META_APP_ID`, `META_APP_SECRET`, `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_APP_SECRET`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, and `GOOGLE_SEARCH_CLIENT_ID` are configured in production environment variables.

---

## 14. Production Validation Results
All 8 V1.5 digital presence platforms resolve deterministically from database truth:
- **Instagram / Facebook / YouTube:** Authentic OAuth connections render `CONNECTED` with handle and actions; reload/login preserves `CONNECTED`.
- **GA4 / Search Console:** Properties link directly to `search_google_connections` and survive browser restart.
- **WhatsApp & Google Business:** Remain 100% stable and fully operational.
- **LinkedIn / X / Threads:** Cleanly removed from customer-facing Digital Presence surfaces.
