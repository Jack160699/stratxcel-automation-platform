// Run with: node --experimental-strip-types lib/rbac/__tests__/unified-crm-inbox.test.ts
//
// Regression guard for the corrective pass that (1) separated /app's and
// /admin's navigation into two genuinely independent information
// architectures sharing only the visual shell, (2) replaced the sidebar's
// hover-expand-as-overlay interaction with a stable expanded-by-default /
// explicit-collapse model, and (3) repaired the CRM workspace layout
// (two-pane + on-demand details drawer, auto-select on desktop, overflow
// containment). components/shell/navigation/{active-route,app-nav-data,
// admin-nav-data}.ts are plain TypeScript (no JSX, no React import), so
// their functions/data are imported and exercised directly here for real
// functional coverage. Everything else (CrmWorkspace and its children,
// Sidebar — all "use client" React components using hooks that only
// resolve in a browser/Next.js runtime) is asserted against source, same
// convention as every other shell/page test in this build.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveActiveKey } from "../../../components/shell/navigation/active-route.ts";
import { APP_NAV_GROUPS_DATA } from "../../../components/shell/navigation/app-nav-data.ts";
import { ADMIN_NAV_GROUPS_DATA } from "../../../components/shell/navigation/admin-nav-data.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function flatten(groups: typeof APP_NAV_GROUPS_DATA) {
  return groups.flatMap((g) => g.items);
}

function run() {
  // =========================================================================
  // NAVIGATION
  // =========================================================================

  const appKeys = new Set(flatten(APP_NAV_GROUPS_DATA).map((i) => i.key));
  const adminKeys = new Set(flatten(ADMIN_NAV_GROUPS_DATA).map((i) => i.key));
  const appHrefs = new Set(flatten(APP_NAV_GROUPS_DATA).map((i) => i.href));
  const adminHrefs = new Set(flatten(ADMIN_NAV_GROUPS_DATA).map((i) => i.href));

  // --- 1/2. /app and /admin each use their own, non-empty nav model -------
  assert.ok(appHrefs.size > 0, "APP_NAV_GROUPS_DATA must be non-empty");
  assert.ok(adminHrefs.size > 0, "ADMIN_NAV_GROUPS_DATA must be non-empty");
  assert.ok([...appHrefs].every((h) => h.startsWith("/app")), "every app nav href must live under /app");
  assert.ok([...adminHrefs].every((h) => h.startsWith("/admin")), "every admin nav href must live under /admin");

  // --- 3. app does not inherit admin-only items or unapproved V1 items ---
  for (const key of ["clients", "handoffs", "operations", "system", "audit", "crm"]) {
    assert.equal(appKeys.has(key), false, `nav item "${key}" must never appear in customer V1 APP_NAV_GROUPS_DATA`);
  }
  assert.equal(appHrefs.has("/admin"), false, "app nav must not link into /admin at all");
  assert.equal(appHrefs.has("/app/crm"), false, "app nav must not link to /app/crm in V1");

  // --- 4. admin does not automatically inherit client-only modules --------
  for (const key of ["copilot", "website", "ads", "brand", "files", "billing", "settings"]) {
    assert.equal(adminKeys.has(key), false, `client-only nav item "${key}" must never appear in ADMIN_NAV_GROUPS_DATA`);
  }
  assert.equal([...adminHrefs].some((h) => h.startsWith("/app")), false, "admin nav must not link into /app at all");

  // --- 5. both use the same visual Sidebar/CoreAppShell component ---------
  const clientShell = read("app", "app", "ClientAppShell.tsx");
  const adminShellSrc = read("app", "admin", "(shell)", "AppShell.tsx");
  assert.ok(/CoreAppShell/.test(clientShell) && /CoreAppShell/.test(adminShellSrc), "both shells must compose the shared CoreAppShell");
  const coreShell = read("components", "shell", "CoreAppShell.tsx");
  assert.equal((coreShell.match(/<Sidebar\b/g) ?? []).length, 1, "CoreAppShell must render exactly one Sidebar for either product");

  // --- 6/7/8. Active-route highlighting resolves independently, real calls
  assert.equal(resolveActiveKey("/app", APP_NAV_GROUPS_DATA), "home", "app Command Center must resolve /app");
  assert.equal(resolveActiveKey("/app/audit", APP_NAV_GROUPS_DATA), "customer-audit", "app Audit must resolve /app/audit");
  assert.equal(resolveActiveKey("/app/content", APP_NAV_GROUPS_DATA), "content", "app Content must resolve /app/content");
  assert.equal(resolveActiveKey("/app/growth", APP_NAV_GROUPS_DATA), "growth", "app Growth must resolve /app/growth");
  assert.equal(resolveActiveKey("/app/integrations", APP_NAV_GROUPS_DATA), "integrations", "app Connectors must resolve /app/integrations");
  assert.equal(resolveActiveKey("/admin/leads", ADMIN_NAV_GROUPS_DATA), "leads", "admin CRM must resolve /admin/leads");
  assert.equal(resolveActiveKey("/admin", ADMIN_NAV_GROUPS_DATA), "overview");
  assert.equal(resolveActiveKey("/admin/clients/some-id", ADMIN_NAV_GROUPS_DATA), "clients", "longest-prefix match must win");
  // The two resolvers are genuinely independent — resolving an /admin path
  // against the APP tree (which contains no /admin hrefs at all) must not
  // accidentally match anything by coincidence.
  assert.notEqual(resolveActiveKey("/admin/leads", APP_NAV_GROUPS_DATA), "leads", "app's nav tree must not resolve an admin-only path");

  // =========================================================================
  // SIDEBAR
  // =========================================================================
  const sidebar = read("components", "shell", "Sidebar.tsx");

  // --- 9. Desktop defaults expanded for new users --------------------------
  assert.ok(/const \[collapsed, setCollapsed\] = useState\(false\)/.test(sidebar), "collapsed must default to false (expanded) before any stored preference loads");

  // --- 10. Explicit collapse works -----------------------------------------
  assert.ok(/function toggleCollapsed/.test(sidebar), "an explicit toggle function must exist");
  assert.ok(/onClick=\{toggleCollapsed\}/.test(sidebar), "collapse/expand must be triggered by an explicit click, not a hover handler");

  // --- 11. Collapse persisted ----------------------------------------------
  assert.ok(/localStorage\.setItem\(COLLAPSE_KEY/.test(sidebar), "collapse preference must be persisted");
  assert.ok(/localStorage\.getItem\(COLLAPSE_KEY\)/.test(sidebar), "collapse preference must be read back on mount");

  // --- 12. No hover-driven layout expansion --------------------------------
  for (const forbidden of ["onMouseEnter", "onMouseLeave", "hoverExpanded", "absolute inset-y-0"]) {
    assert.equal(sidebar.includes(forbidden), false, `Sidebar must not use "${forbidden}" — no hover-driven overlay expansion`);
  }

  // --- 13. Collapsed-mode tooltips remain accessible -----------------------
  assert.ok(/<Tooltip key=\{item\.key\} label=\{item\.label\}>/.test(sidebar), "each collapsed nav item must be wrapped in a Tooltip");

  // --- 14. No horizontal overflow -------------------------------------------
  assert.ok(/overflow-x-hidden/.test(sidebar), "Sidebar must guard against horizontal overflow");

  // =========================================================================
  // CRM
  // =========================================================================
  const crmWorkspace = read("components", "crm", "CrmWorkspace.tsx");

  // --- 15/16/17. Real tables still used ------------------------------------
  const leadsRepo = read("packages", "leads-and-crm", "src", "repository.ts");
  assert.ok(/\.from\(["']crm_leads["']\)/.test(leadsRepo), "leads-and-crm repository must read the real crm_leads table");
  const messagesLib = read("packages", "whatsapp", "src", "messages.ts");
  assert.ok(/\.from\(["']whatsapp_conversations["']\)/.test(messagesLib), "must read the real whatsapp_conversations table");
  assert.ok(/\.from\(["']whatsapp_messages["']\)/.test(messagesLib), "must read the real whatsapp_messages table");
  assert.ok(/\/api\/platform\/leads\?tenantId=/.test(crmWorkspace), "CrmWorkspace must fetch real leads through the existing tenant-scoped leads API");

  // --- 18. Most recent conversation auto-selects on desktop ----------------
  assert.ok(/isDesktop/.test(crmWorkspace) && /matchMedia\(DESKTOP_MEDIA_QUERY\)/.test(crmWorkspace), "must detect desktop viewport via matchMedia");
  assert.ok(/last_message_at.*localeCompare|localeCompare.*last_message_at/.test(crmWorkspace), "auto-selection must sort by real last_message_at, most recent first");
  assert.ok(/mostRecent \?\? entries\[0\]/.test(crmWorkspace), "must fall back to the first lead when no conversation exists yet");

  // --- 19. Explicit lead deep-link wins over auto-selection -----------------
  assert.ok(/initialLeadId \?\? null/.test(crmWorkspace), "selection must initialize from an explicit route leadId first");
  assert.ok(/const stillValid = selectedLeadId && entries\.some/.test(crmWorkspace), "auto-select must not override an already-valid explicit/current selection");

  // --- 20. Search stays inside the list pane ---------------------------------
  const conversationList = read("components", "crm", "ConversationList.tsx");
  assert.ok(/min-w-0 max-w-full/.test(conversationList), "the search input must be width-bounded to its own pane");
  assert.ok(/box-border/.test(conversationList), "the search input must use border-box sizing so padding/border can never push it past 100% width");
  assert.ok(/w-full max-w-full overflow-x-hidden/.test(crmWorkspace), "the list pane's own wrapper must be width-contained inside the CRM grid track");

  // --- 21. Details closed by default -----------------------------------------
  assert.ok(/const \[detailsOpen, setDetailsOpen\] = useState\(false\)/.test(crmWorkspace), "detailsOpen must default to false");
  assert.equal(/localStorage\.getItem\(["']sx-crm-details-open["']\)/.test(crmWorkspace), false, "must not read a previous deployment's stored details-open preference");
  assert.equal(/DETAILS_PANEL_KEY/.test(crmWorkspace), false, "details-open state must not be persisted at all — always starts closed");

  // --- 22. Details uses a drawer, never a persistent desktop third column --
  assert.equal(/xl:grid-cols|xl:block/.test(crmWorkspace), false, "CrmWorkspace must not define any xl+-specific persistent column");
  assert.ok(/grid-cols-1 md:grid-cols-\[minmax\(280px,330px\)_1fr\]/.test(crmWorkspace), "the grid must define exactly two tracks (list, chat) — no third");
  assert.ok(/<Drawer open=\{detailsOpen\}/.test(crmWorkspace), "lead details must render through the shared Drawer overlay");
  assert.ok(/<Modal open=\{detailsOpen\}/.test(crmWorkspace), "lead details must render through the shared Modal sheet on mobile");

  // --- 23/24. Inbound/outbound bubble mapping --------------------------------
  const chatBubble = read("components", "crm", "ChatBubble.tsx");
  assert.ok(/outbound = message\.direction === ["']outbound["']/.test(chatBubble), "bubble side must be derived only from the real message.direction field");
  assert.ok(/justify-end/.test(chatBubble) && /justify-start/.test(chatBubble), "must render distinct left/right alignment for inbound vs outbound");

  // --- 25. Delivery statuses render ------------------------------------------
  for (const status of ["queued", "sent", "delivered", "read", "failed"]) {
    assert.ok(chatBubble.includes(`"${status}"`), `ChatBubble's delivery indicator must handle the real "${status}" status`);
  }

  // --- 26. Unread rendering preserved -----------------------------------------
  const conversationRow = read("components", "crm", "ConversationRow.tsx");
  assert.ok(/unread_count/.test(conversationRow), "ConversationRow must render the real unread_count");

  // --- 27. Opening a conversation clears unread through existing behavior ---
  const conversationDetailRoute = read("app", "api", "platform", "whatsapp", "conversations", "[id]", "route.ts");
  assert.ok(/markConversationRead/.test(conversationDetailRoute), "GET /api/platform/whatsapp/conversations/[id] must still mark the conversation read server-side");
  assert.ok(/setConversations.*unread_count:\s*0/s.test(crmWorkspace), "selecting a conversation must optimistically zero its unread badge in the UI");

  // --- 28. Polling preserved ---------------------------------------------------
  assert.ok(/LIST_POLL_MS = 8_000/.test(crmWorkspace), "list polling interval must be preserved");
  assert.ok(/THREAD_POLL_MS = 4_000/.test(crmWorkspace), "thread polling interval must be preserved");
  assert.ok(/if \(!document\.hidden\)/.test(crmWorkspace), "polling must still pause while the tab is hidden");

  // --- 29. /app/conversations redirects to /app in customer V1 ------
  const conversationsPage = read("app", "app", "conversations", "page.tsx");
  assert.ok(/redirect\("\/app"\)/.test(conversationsPage), "conversations must redirect to /app in customer V1");

  // =========================================================================
  // ADMIN LEADS
  // =========================================================================
  const adminLeadsTabs = read("app", "admin", "(shell)", "leads", "AdminLeadsTabs.tsx");

  // --- 30. Default tab is CRM --------------------------------------------------
  assert.ok(/searchParams\.get\("tab"\) === ["']website["'] \? ["']website["'] : ["']crm["']/.test(adminLeadsTabs), "tab must default to crm unless the URL explicitly says otherwise — never default to website");

  // --- 31. WhatsApp lead visible through the CRM data path ---------------------
  assert.ok(/CrmWorkspace/.test(adminLeadsTabs), "the CRM tab must render the real shared CrmWorkspace");

  // --- 32. Website inquiries remain accessible secondarily ----------------------
  const adminLeadsPage = read("app", "admin", "(shell)", "leads", "page.tsx");
  assert.ok(/stratxcel_contact_messages/.test(adminLeadsPage), "website inquiries (stratxcel_contact_messages) must still be read and preserved");
  assert.ok(/Website inquiries/.test(adminLeadsTabs), "website inquiries must be reachable as an explicit secondary tab");

  // --- 33. Client switcher scoping preserved -------------------------------------
  assert.ok(/useCurrentTenant/.test(adminLeadsTabs), "must read the active client from the existing ClientSwitcher-backed context");
  assert.ok(/tenantId=\{active\.tenantId\}/.test(adminLeadsTabs), "CrmWorkspace must be scoped to the currently selected client, never an unscoped/global query");

  // =========================================================================
  // SECURITY
  // =========================================================================

  // --- 34. Tenant isolation unchanged ---------------------------------------------
  const fetchStarts = [...crmWorkspace.matchAll(/fetch\(/g)].map((m) => m.index);
  assert.ok(fetchStarts.length > 0, "CrmWorkspace must issue tenant-scoped fetches");
  for (const start of fetchStarts) {
    const chunk = crmWorkspace.slice(start, start + 400);
    assert.ok(/tenantId/.test(chunk), `every CrmWorkspace fetch must be tenant-scoped: ${chunk.slice(0, 80)}…`);
  }

  // --- 35. RBAC unchanged -----------------------------------------------------------
  assert.ok(/can\(role, ["']crm:manage["']\)/.test(crmWorkspace), "lead-management controls must be gated by the real crm:manage permission");
  assert.ok(/can\(role, ["']whatsapp:send["']\)/.test(crmWorkspace), "the composer must be gated by the real whatsapp:send permission");

  // --- 36. No client-side service-role credential exposure ---------------------------
  for (const file of fs.readdirSync(path.join(root, "components", "crm")).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))) {
    const src = read("components", "crm", file);
    assert.equal(
      /SUPABASE_SERVICE_ROLE_KEY|createSupabaseServiceClient|getTenantServiceContext/.test(src),
      false,
      `components/crm/${file} is client-rendered and must never reference a service-role client`
    );
  }
  for (const file of ["Sidebar.tsx", "CoreAppShell.tsx"]) {
    const src = read("components", "shell", file);
    assert.equal(/SUPABASE_SERVICE_ROLE_KEY|createSupabaseServiceClient/.test(src), false, `components/shell/${file} must never reference a service-role client`);
  }

  // --- 37. No WhatsApp secret/credential changes ------------------------------------
  for (const file of ["Sidebar.tsx", "CoreAppShell.tsx"]) {
    const src = read("components", "shell", file);
    assert.equal(/WHATSAPP_APP_SECRET|WHATSAPP_TOKEN|WHATSAPP_VERIFY_TOKEN|WHATSAPP_INTEGRATION_MODE|WHATSAPP_AUTO_REPLY_ENABLED/.test(src), false, `components/shell/${file} must never reference WhatsApp secrets/flags`);
  }
  assert.equal(/WHATSAPP_APP_SECRET|WHATSAPP_TOKEN|WHATSAPP_VERIFY_TOKEN/.test(crmWorkspace), false, "CrmWorkspace must never reference WhatsApp secrets directly");

  // =========================================================================
  // RESPONSIVE
  // =========================================================================

  // --- 38. 1366 desktop does not create a persistent third pane ------------------
  const gridColsMatches = crmWorkspace.match(/grid-cols-\[[^\]]*\]/g) ?? [];
  for (const m of gridColsMatches) {
    assert.equal((m.match(/_/g) ?? []).length <= 1, true, `grid track definition must describe at most two columns: ${m}`);
  }

  // --- 39. Mobile list -> thread behavior works -------------------------------------
  assert.ok(/mobileView/.test(crmWorkspace), "CrmWorkspace must track which mobile-level view is active");
  assert.ok(/setMobileView\(["']thread["']\)/.test(crmWorkspace), "selecting a conversation must advance to the full-screen thread view on mobile");
  assert.ok(/setMobileView\(["']list["']\)/.test(crmWorkspace), "the back action must return to the list view on mobile");

  // --- 40. Details overlay works on desktop/tablet/mobile ----------------------------
  assert.ok(/hidden md:block/.test(crmWorkspace), "the Drawer must be the details surface at and above the md breakpoint (desktop + tablet)");
  assert.ok(/md:hidden/.test(crmWorkspace), "the Modal sheet must be the details surface below the md breakpoint (mobile)");

  console.log(
    "unified-crm-inbox.test.ts: ALL PASS (separate app/admin nav models, independent active-route resolution, stable explicit-collapse sidebar, two-pane CRM layout with on-demand details drawer, desktop auto-selection, overflow containment, live data preserved, admin CRM-first tab default, tenant isolation, RBAC, no service-role/secret exposure, responsive behavior)"
  );
}

run();
