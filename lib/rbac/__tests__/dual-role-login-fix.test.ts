import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decideIdentityState } from "../../identity/identity-state.ts";
import { parseWorkspaceModeParam, sanitizeAuthIntent, sanitizeRedirectUrl } from "../../auth/redirect.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  assert.equal(parseWorkspaceModeParam("customer"), "customer");
  assert.equal(parseWorkspaceModeParam("admin"), "admin");
  assert.equal(parseWorkspaceModeParam("evil"), null);
  assert.equal(sanitizeAuthIntent(null, "customer"), "customer");
  assert.equal(sanitizeRedirectUrl("https://evil.example"), "/app");

  assert.equal(
    decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 1, hasValidStaffWorkspace: false, workspaceMode: "customer" }),
    "CUSTOMER_MEMBER"
  );
  assert.equal(
    decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 1, hasValidStaffWorkspace: false, workspaceMode: "admin" }),
    "INTERNAL_STAFF"
  );
  assert.equal(
    decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 0, hasValidStaffWorkspace: false, workspaceMode: "customer" }),
    "NEW_CUSTOMER"
  );
  assert.equal(
    decideIdentityState({ hasSession: true, isStaff: false, membershipCount: 1, hasValidStaffWorkspace: false, workspaceMode: "admin" }),
    "CUSTOMER_MEMBER"
  );
  assert.equal(
    decideIdentityState({ hasSession: true, isStaff: true, membershipCount: 1, hasValidStaffWorkspace: true, workspaceMode: "customer" }),
    "CUSTOMER_MEMBER"
  );

  const loginForm = read("app", "login", "LoginForm.tsx");
  const loginPage = read("app", "login", "page.tsx");
  const adminLogin = read("app", "admin", "AdminLogin.tsx");
  const callback = read("app", "auth", "callback", "route.ts");
  const oauth = read("app", "components", "auth", "GoogleOAuthButton.tsx");
  const oneTap = read("app", "components", "auth", "GoogleOneTap.tsx");
  const guestCheckout = read("app", "audit", "checkout", "GuestCheckoutForm.tsx");

  assert.ok(/finalizeAuthWorkspaceIntent\("customer"\)/.test(loginForm));
  assert.equal(/establishPendingWorkspaceIntent/.test(loginPage), false, "/login page must not write cookies during render");
  assert.equal(/finalizeAuthWorkspaceIntent\(authMode/.test(loginForm), false, "/login must not honor mode=admin from URL");
  assert.ok(/finalizeAuthWorkspaceIntent\("admin"\)/.test(adminLogin));
  assert.ok(/finalizeAuthWorkspaceIntent/.test(callback));
  assert.ok(/searchParams\.set\("mode"/.test(oauth));
  assert.ok(/finalizeAuthWorkspaceIntent/.test(oneTap));
  assert.ok(/mode=customer&next=\/audit\/checkout/.test(guestCheckout));

  assert.equal(/Human-reviewed|follow the team/i.test(loginPage), false);
  assert.equal(/reviewed and delivered by the Stratxcel team/i.test(read("app", "audit", "page.tsx")), false);

  console.log("dual-role-login-fix.test.ts: ALL PASS");
}

run();
