// Run with: node --experimental-strip-types lib/release/__tests__/admin-view-mode-architecture.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_NAV_GROUPS_DATA } from "../../../components/shell/navigation/admin-nav-data.ts";
import { filterNavGroupsByMode, isAdminViewMode } from "../admin-view-mode-filter.ts";
import { parseAdminViewMode, ADMIN_VIEW_MODE_COOKIE } from "../admin-view-mode-pure.ts";
import { flattenNavGroups } from "../../../components/shell/navigation/active-route.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  // --- Pure cookie/type helpers --------------------------------------------
  assert.equal(isAdminViewMode("normal"), true);
  assert.equal(isAdminViewMode("technical"), true);
  assert.equal(isAdminViewMode("hack"), false);
  assert.equal(isAdminViewMode(undefined), false);
  assert.equal(parseAdminViewMode(undefined), "normal", "missing preference must fail closed to Normal");
  assert.equal(parseAdminViewMode("technical"), "technical");
  assert.equal(parseAdminViewMode("garbage"), "normal", "unknown value must fail closed to Normal");
  assert.equal(ADMIN_VIEW_MODE_COOKIE, "sx_admin_view_mode");

  // --- filterNavGroupsByMode: default-normal, mutual exclusivity, empty-group dropping ---
  const sample = [
    { label: "A", items: [{ key: "a1", label: "A1", href: "/a1" }, { key: "a2", label: "A2", href: "/a2", mode: "technical" as const }] },
    { label: "B", items: [{ key: "b1", label: "B1", href: "/b1", mode: "technical" as const }] },
  ];
  const normalOnly = filterNavGroupsByMode(sample, { mode: "normal" });
  assert.equal(normalOnly.length, 1, "a group that becomes fully empty in this mode must be dropped");
  assert.equal(normalOnly[0]!.items.length, 1);
  assert.equal(normalOnly[0]!.items[0]!.key, "a1", "an item with no mode field defaults to normal");

  const technicalOnly = filterNavGroupsByMode(sample, { mode: "technical" });
  const technicalKeys = flattenNavGroups(technicalOnly as never).map((i) => i.key);
  assert.deepEqual(technicalKeys, ["a2", "b1"]);

  // --- Real admin nav: every item has an explicit or defaulted mode; the ---
  // two modes are mutually exclusive and together cover every real item.
  const allKeys = flattenNavGroups(ADMIN_NAV_GROUPS_DATA).map((i) => i.key);
  const normalAdmin = filterNavGroupsByMode(ADMIN_NAV_GROUPS_DATA, { mode: "normal" });
  const technicalAdmin = filterNavGroupsByMode(ADMIN_NAV_GROUPS_DATA, { mode: "technical" });
  const normalKeys = new Set(flattenNavGroups(normalAdmin).map((i) => i.key));
  const technicalKeys2 = new Set(flattenNavGroups(technicalAdmin).map((i) => i.key));
  for (const key of allKeys) {
    assert.ok(
      normalKeys.has(key) !== technicalKeys2.has(key),
      `${key} must appear in exactly one of Normal/Technical mode, never both or neither`
    );
  }

  // Master build brief sections 15-16: these specific real destinations
  // belong in Technical mode, never Normal.
  const technicalHrefs = new Set(flattenNavGroups(technicalAdmin).map((i) => i.href));
  for (const href of ["/admin/missions", "/admin/system", "/admin/audit", "/admin/integrations", "/admin/operations", "/admin/operating-brain", "/admin/hermes", "/admin/capabilities"]) {
    assert.ok(technicalHrefs.has(href), `${href} must be classified Technical`);
  }
  const normalHrefs = new Set(flattenNavGroups(normalAdmin).map((i) => i.href));
  for (const href of ["/admin", "/admin/clients", "/admin/leads", "/admin/finance", "/admin/approvals", "/admin/handoffs", "/admin/social", "/admin/team"]) {
    assert.ok(normalHrefs.has(href), `${href} must be classified Normal`);
  }
  // No functionality lost in the split -- every real item from before the
  // split is still reachable in exactly one mode.
  assert.equal(normalKeys.size + technicalKeys2.size, allKeys.length);

  // --- Server-owned cookie + owner gate, mirroring release-mode's pattern ---
  const viewModeApi = read("app", "api", "admin", "view-mode", "route.ts");
  assert.ok(/requireOwnerContext/.test(viewModeApi));
  assert.ok(/setAdminViewModeCookie/.test(viewModeApi));
  assert.ok(/admin\.view_mode\.technical_enabled/.test(viewModeApi));
  assert.ok(/admin\.view_mode\.normal_enabled/.test(viewModeApi));

  const viewModeLib = read("lib", "release", "admin-view-mode.ts");
  assert.ok(/httpOnly:\s*true/.test(viewModeLib));
  assert.ok(/sameSite:\s*["']lax["']/.test(viewModeLib));
  assert.equal(/localStorage/.test(viewModeLib), false);

  // --- Toggle lives only in admin shell, same contract as the Beta toggle ---
  const adminShell = read("app", "admin", "(shell)", "AppShell.tsx");
  assert.ok(/AdminViewModeToggle/.test(adminShell));
  const toggle = read("components", "shell", "AdminViewModeToggle.tsx");
  assert.ok(/role=["']switch["']/.test(toggle));
  assert.ok(/aria-checked/.test(toggle));
  assert.ok(/\/api\/admin\/view-mode/.test(toggle));

  // --- Customer shell has no technical-mode control ------------------------
  const clientShell = read("app", "app", "ClientAppShell.tsx");
  assert.equal(/AdminViewModeToggle|admin-view-mode|sx_admin_view_mode/.test(clientShell), false);

  console.log("admin-view-mode-architecture.test.ts: ALL PASS");
}

run();
