// Run with: node --experimental-strip-types lib/rbac/__tests__/admin-whatsapp-agent-pairing.test.ts
//
// Regression guard for the Admin WhatsApp Agent pairing auth bug: the
// pairing/status/link routes used to resolve the caller's identity via
// requireTenantContext(tenantId), which meant a platform_owner/platform_admin
// with zero client tenants could never generate a pairing code at all, and
// the Admin Integrations page hid the pairing card entirely behind
// {tenantId && (...)}. Platform staff are not tenant-scoped (see
// platform_staff_users) — identity must come from the Supabase session
// alone, exactly like app/api/platform/tenants/route.ts's established
// tenant-independent-read pattern.
//
// createSupabaseServerClient() reads next/headers cookies() internally —
// invoking it, or even importing its module directly, only works inside a
// real Next.js request scope (see platform-admin-layout-gate.test.ts for
// the same constraint). This asserts against the actual route/page source
// instead, the same methodology every other Next.js-session-dependent
// RBAC test in this repo already uses.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const pairing = read("app", "api", "admin", "whatsapp-agent", "pairing", "route.ts");
  const status = read("app", "api", "admin", "whatsapp-agent", "status", "route.ts");
  const link = read("app", "api", "admin", "whatsapp-agent", "link", "route.ts");
  const platformStaffAuth = read("lib", "platform-staff", "auth.ts");
  const adminIntegrationsPage = read("app", "admin", "(shell)", "integrations", "page.tsx");
  const clientIntegrationsPage = read("app", "app", "integrations", "page.tsx");
  const pairingCard = read("components", "agent-core", "WhatsAppAgentPairingCard.tsx");

  for (const [name, source] of [
    ["pairing", pairing],
    ["status", status],
    ["link", link],
  ] as const) {
    // The old tenant-indirection bug must be fully gone, not just papered
    // over — these routes must never import or call requireTenantContext,
    // and must never read a client-supplied tenantId from the request
    // (a literal `tenantId: null` passed to createPairingChallenge is fine
    // and expected — that's the principal's stored tenant scope, not an
    // input read from the caller).
    assert.equal(/requireTenantContext/.test(source), false, `${name} route must not use requireTenantContext — platform staff are not tenant-scoped`);
    assert.equal(/body[?.]*\.tenantId|searchParams\.get\(\s*["']tenantId["']\s*\)|body\?\.\[?["']tenantId["']/.test(source), false, `${name} route must not read tenantId from the request body/query`);
    assert.equal(/await request\.json\(\)/.test(source), false, `${name} route must not parse a request body at all (no input is needed to resolve the caller's own identity)`);

    // Identity resolved directly from the Supabase session, matching
    // app/api/platform/tenants/route.ts's tenant-independent pattern.
    assert.ok(/createSupabaseServerClient/.test(source), `${name} route must resolve identity via createSupabaseServerClient()`);
    assert.ok(/auth\.getUser\(\)/.test(source), `${name} route must call auth.getUser()`);

    // Anonymous caller cannot pass: the route must reject a missing user
    // BEFORE any staff/role check runs.
    const userCheckIndex = source.search(/if\s*\(\s*!user\s*\)\s*return\s*Response\.json\([^)]*status:\s*401/);
    assert.ok(userCheckIndex !== -1, `${name} route must return 401 for an unauthenticated caller (!user) before checking staff role`);

    const staffCallIndex = source.indexOf("requirePlatformStaff(");
    assert.ok(staffCallIndex !== -1, `${name} route must call requirePlatformStaff()`);
    assert.ok(userCheckIndex < staffCallIndex, `${name} route must check authentication (!user) before requirePlatformStaff()`);

    // Never trust a client-supplied identity — requirePlatformStaff must
    // always be called with the session's own user.id, never a body/query field.
    assert.ok(/requirePlatformStaff\(\s*user\.id/.test(source), `${name} route must call requirePlatformStaff(user.id, ...) — never a request-supplied id`);
  }

  // Mutating pairing-code generation stays restricted to owner/admin roles;
  // status/revoke (self-service, non-mutating-of-others) stay open to any
  // active staff role — preserving the pre-fix role scoping exactly.
  assert.ok(
    /requirePlatformStaff\(\s*user\.id\s*,\s*\[\s*["']platform_owner["']\s*,\s*["']platform_admin["']\s*\]\s*\)/.test(pairing),
    "pairing route must restrict code generation to platform_owner/platform_admin"
  );

  // Staff principals must always be created tenant_id: null — a staff
  // whatsapp_channel_principals row is never scoped to one tenant.
  assert.ok(/tenantId:\s*null/.test(pairing), "pairing route must create the staff principal with tenantId: null");

  // requirePlatformStaff() itself must implement "active staff row required,
  // independent of any tenant membership" — this is what actually makes an
  // ordinary tenant user (no platform_staff_users row) fail, and a real
  // active platform_owner succeed regardless of tenant memberships.
  assert.ok(/from\(\s*["']platform_staff_users["']\s*\)/.test(platformStaffAuth), "requirePlatformStaff must query platform_staff_users, never tenant_members");
  assert.ok(/is_active/.test(platformStaffAuth), "requirePlatformStaff must require an active staff row");
  assert.equal(/tenant_members/.test(platformStaffAuth), false, "requirePlatformStaff must never fall back to tenant membership as a substitute for staff status");

  // Admin Integrations: the pairing card must render unconditionally — NOT
  // gated behind {tenantId && (...)}, so a platform_owner with zero client
  // tenants ("No clients yet") still sees "Link my WhatsApp".
  const cardTagIndex = adminIntegrationsPage.indexOf("<WhatsAppAgentPairingCard");
  assert.ok(cardTagIndex !== -1, "Admin Integrations page must still render WhatsAppAgentPairingCard");
  const precedingSlice = adminIntegrationsPage.slice(Math.max(0, cardTagIndex - 120), cardTagIndex);
  assert.equal(/\{tenantId\s*&&\s*\($/.test(precedingSlice.trimEnd()), false, "Admin Integrations must not gate WhatsAppAgentPairingCard behind {tenantId && (...)}");
  assert.equal(/tenantId=\{tenantId\}/.test(adminIntegrationsPage.slice(cardTagIndex, cardTagIndex + 400)), false, "Admin card must not be passed a tenantId prop");

  // The rest of the Integrations page (phone bindings, embedded signup,
  // shadow messages) is out of scope for this fix and must remain
  // tenant-gated exactly as before — this is a narrow correction, not a
  // redesign.
  assert.ok(/\{tenantId && \(\s*<Card>\s*<CardHeading>Connect via WhatsApp Embedded Signup/.test(adminIntegrationsPage), "Embedded Signup card must remain tenant-gated, unchanged");

  // Client /app pairing is untouched: still tenant-scoped, still uses
  // requireTenantContext in its own routes, still gated behind {tenantId && (...)}.
  const clientCardTagIndex = clientIntegrationsPage.indexOf("<WhatsAppAgentPairingCard");
  assert.ok(clientCardTagIndex !== -1, "Client Integrations page must still render WhatsAppAgentPairingCard");
  const clientPrecedingSlice = clientIntegrationsPage.slice(Math.max(0, clientCardTagIndex - 60), clientCardTagIndex);
  assert.ok(/\{tenantId\s*&&\s*\($/.test(clientPrecedingSlice.trimEnd()), "Client Integrations must still gate WhatsAppAgentPairingCard behind {tenantId && (...)}");
  assert.ok(
    /tenantId=\{tenantId\}/.test(clientIntegrationsPage.slice(clientCardTagIndex, clientCardTagIndex + 400)),
    "Client card must still receive tenantId"
  );

  const clientPairingRoute = read("app", "api", "platform", "whatsapp-agent", "pairing", "route.ts");
  assert.ok(/requireTenantContext/.test(clientPairingRoute), "Client pairing route must still require tenant context — unchanged");

  // The shared card component must make tenantId optional (not required),
  // so the same component serves both the tenant-scoped Client card and
  // the session-only Admin card without a fake/placeholder tenantId.
  assert.ok(/tenantId\?:\s*string/.test(pairingCard), "WhatsAppAgentPairingCardProps.tenantId must be optional");
  assert.ok(/setTimeout\(poll,\s*2000\)/.test(pairingCard), "active pairing must poll on a bounded ~2 second cadence");
  assert.ok(/Date\.now\(\)\s*>=\s*expiresAt/.test(pairingCard), "pairing poll must stop at expiry");
  assert.ok(/cancelled\s*=\s*true/.test(pairingCard) && /clearTimeout\(timer\)/.test(pairingCard), "pairing poll must stop on unmount");
  assert.ok(/setPendingCode\(null\).*plaintext code/s.test(pairingCard), "successful LINK detection must clear plaintext code state");
  assert.equal(/localStorage|sessionStorage/.test(pairingCard), false, "pairing plaintext must never be persisted in browser storage");
  assert.ok(/Refresh status/.test(pairingCard), "manual refresh fallback must remain available");
  assert.equal(/if\s*\(!props\.tenantId\)\s*return;/.test(pairingCard), false, "loadStatus() must not silently no-op when tenantId is absent (that hid the Admin card's status entirely)");

  console.log("admin-whatsapp-agent-pairing.test.ts: ALL PASS (staff-scoped identity, no tenant indirection, card renders without active tenant, client pairing unchanged)");
}

run();
