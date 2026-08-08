// Run with: node --experimental-strip-types app/api/platform/domains/__tests__/domain-safety.test.ts
//
// Static safety checks on the domain search/purchase routes, the additive
// migration, and the fulfilment module. Does not re-test the payment
// webhook/RPC internals — those are unmodified by this task except for the
// additive `purpose` passthrough, covered by its own assertion below.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const readCode = (...parts: string[]) =>
  fs
    .readFileSync(path.join(root, ...parts), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // --- 1. Domain search never fabricates availability/pricing -------------
  const searchSource = readCode("app", "api", "platform", "domains", "search", "route.ts");
  assert.equal(searchSource.includes("new SandboxDomainRegistrar()"), false, "search must go through the mode-gated selector, never a hardcoded sandbox instance");
  assert.ok(/selectDomainRegistrar\(\)/.test(searchSource), "search must resolve the registrar via the mode-gated selector");
  assert.ok(/mode === "disabled"/.test(searchSource), "disabled mode must be explicitly handled, not silently fall through to sandbox data");
  assert.ok(/mode:\s*registrar\.mode/.test(searchSource), "the response must be labeled with which mode produced it");

  // --- 2. Domain purchase: server-controlled price, purpose isolation -----
  const purchaseSource = readCode("app", "api", "platform", "domains", "purchase", "route.ts");
  assert.equal(/amountCents\s*:\s*body\./.test(purchaseSource), false, "no amount may ever be read from the request body");
  assert.ok(/amountCents:\s*searchRes\.priceCents/.test(purchaseSource), "the charged amount must come from a fresh registrar quote, not client input");
  assert.ok(/paymentPurpose:\s*"domain_purchase"/.test(purchaseSource), "purpose must be hardcoded to domain_purchase");
  assert.equal(/wallet_topup|audit_fee|subscription_payment/.test(purchaseSource), false, "domain purchase must not touch any other payment purpose");
  assert.ok(/isPaymentFeatureEnabled\("PAYMENTS_DOMAINS_ENABLED"\)/.test(purchaseSource), "must be gated by PAYMENTS_DOMAINS_ENABLED");
  assert.equal(searchSource.includes("PAYMENTS_SUBSCRIPTIONS_ENABLED") || purchaseSource.includes("PAYMENTS_SUBSCRIPTIONS_ENABLED"), false, "domain routes must never reference the subscriptions flag");

  // --- 3. Fulfilment is idempotent: claim-before-act, never blind re-register
  const fulfilmentSource = readCode("lib", "domains", "fulfillment.ts");
  assert.ok(/\.eq\("status", "paid_pending_registration"\)/.test(fulfilmentSource), "registration must claim the row via a status-guarded update before calling the registrar");
  assert.ok(/if \(!claimed\) return;/.test(fulfilmentSource), "losing the claim race must be a safe no-op, never a duplicate registration");

  // --- 4. Registrar credentials/tokens are never part of any response body
  for (const src of [searchSource, purchaseSource, fulfilmentSource]) {
    assert.equal(/VERCEL_AUTH_TOKEN\s*[:=]\s*(?!process\.env)/.test(src), false, "no route may hardcode or echo a Vercel token");
  }

  // --- 5. Additive migration: hardened RPC, widened (not replaced) status -
  const migrationSource = read("supabase", "migrations", "20260808230000_website_domain_lifecycle.sql");
  assert.equal(/drop\s+table/i.test(migrationSource), false, "migration must not drop any table");
  assert.equal(
    /create (or replace )?function public\.reconcile_and_fulfill_razorpay_payment_v4/.test(migrationSource),
    false,
    "must not modify the live payment orchestrator"
  );
  assert.equal(/create (or replace )?function public\.process_refund_atomic_v11/.test(migrationSource), false, "must not modify the refund RPC");
  assert.ok(/security definer/.test(migrationSource) && /set search_path = public, pg_temp/.test(migrationSource), "the new RPC must set an explicit search_path");
  assert.ok(/revoke all on function public\.apply_site_project_version/.test(migrationSource), "the new RPC must revoke public/anon/authenticated");
  assert.ok(/grant execute on function public\.apply_site_project_version.*to service_role/.test(migrationSource), "the new RPC must be service_role-only");
  for (const table of ["site_project_versions"]) {
    assert.ok(new RegExp(`alter table ${table} enable row level security;`).test(migrationSource), `${table}: RLS must be enabled`);
    assert.ok(
      new RegExp(`create policy \\w+ on ${table} for select[\\s\\S]{0,300}tenant_members`).test(migrationSource),
      `${table}: must have a tenant-scoped select policy`
    );
  }

  // --- 6. Approval can never be granted to a non-approvable status --------
  assert.ok(/not_approvable_from_current_status/.test(migrationSource), "approve must reject when the project isn't in an approvable status");
  assert.ok(/approved_version_id = case when p_action = 'approve'/.test(migrationSource), "approved_version_id must only ever move on an explicit approve action");

  // --- 7. The webhook's purpose passthrough is additive only --------------
  const webhookEventsSource = readCode("packages", "payments-and-wallet", "src", "razorpay", "webhook-events.ts");
  assert.ok(/purpose:\s*\(rpcData as any\)\?\.purpose/.test(webhookEventsSource), "webhook-events must pass through the orchestrator's own purpose field");

  console.log("domain-safety.test.ts: ALL PASS");
}

run();
