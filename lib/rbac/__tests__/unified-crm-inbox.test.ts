// Run with: node --experimental-strip-types lib/rbac/__tests__/unified-crm-inbox.test.ts
//
// Regression guard for the unified /app + /admin shell and the real
// crm_leads/whatsapp_conversations/whatsapp_messages CRM/inbox workspace
// (components/crm/*), replacing the old shadow-message "proposed replies"
// UI. components/shell/navigation-data.ts holds the nav model as plain
// TypeScript (no JSX, no React import), specifically so it can be imported
// and its functions called directly here for real functional coverage —
// components/shell/navigation.tsx (which merges this data with JSX icon
// components) can't be imported by a plain Node script, since
// --experimental-strip-types strips TypeScript types but does not provide a
// JSX transform. Everything else here (CrmWorkspace and its children, which
// are "use client" React components using hooks that only resolve in a
// browser/Next.js runtime) is asserted against source, same convention as
// every other shell/page test in this build.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNavGroupsData as buildSidebarGroups, flattenNavItemsData as flattenNavItems, resolveActiveKey } from "../../../components/shell/navigation-data.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

function run() {
  // =========================================================================
  // UNIFIED SHELL
  // =========================================================================

  // --- 1. /app and /admin both use the same canonical navigation model ---
  const appGroups = buildSidebarGroups("app");
  const adminGroups = buildSidebarGroups("admin");
  assert.ok(appGroups.length > 0 && adminGroups.length > 0, "both modes must produce non-empty nav groups");

  // --- 2. Common destinations stay in the same relative order in both ----
  const sharedKeys = ["home", "missions", "approvals", "crm", "integrations", "team"];
  const appOrder = flattenNavItems("app")
    .map((i) => i.key)
    .filter((k) => sharedKeys.includes(k));
  const adminOrder = flattenNavItems("admin")
    .map((i) => i.key)
    .filter((k) => sharedKeys.includes(k));
  assert.deepEqual(appOrder, adminOrder, "shared destinations must appear in the same relative order in both /app and /admin");
  // Same href pairing for the CRM concept specifically (different route, same position/order).
  const appCrm = flattenNavItems("app").find((i) => i.key === "crm");
  const adminCrm = flattenNavItems("admin").find((i) => i.key === "crm");
  assert.equal(appCrm?.href, "/app/crm");
  assert.equal(adminCrm?.href, "/admin/leads");

  // --- 3. Admin-only items are role-gated (never reachable from /app) ----
  const adminOnlyKeys = ["clients", "handoffs", "operations", "system", "audit"];
  const appKeys = new Set(flattenNavItems("app").map((i) => i.key));
  for (const key of adminOnlyKeys) {
    assert.equal(appKeys.has(key), false, `admin-only nav item "${key}" must never appear in the /app sidebar`);
    assert.ok(flattenNavItems("admin").some((i) => i.key === key), `admin-only nav item "${key}" must appear in /admin`);
  }
  // No /app-only concept (e.g. Copilot) leaks into /admin either.
  assert.equal(flattenNavItems("admin").some((i) => i.key === "copilot"), false, "/admin must never render a Copilot nav item — no admin equivalent exists");

  // --- 4. Active-route highlighting: longest-prefix match, real function --
  assert.equal(resolveActiveKey("/app", "app"), "home");
  assert.equal(resolveActiveKey("/app/crm", "app"), "crm");
  assert.equal(resolveActiveKey("/app/crm/abc-123", "app"), "crm", "a lead deep link must still highlight the CRM nav item");
  assert.equal(resolveActiveKey("/admin", "admin"), "home");
  assert.equal(resolveActiveKey("/admin/leads", "admin"), "crm", "admin's Leads route highlights the shared 'crm' nav key");
  assert.equal(resolveActiveKey("/admin/clients/some-tenant-id", "admin"), "clients");
  assert.notEqual(resolveActiveKey("/admin/leads", "admin"), "home", "a longer, more specific prefix must win over the root item");

  // --- 5. No duplicate/nested sidebars — exactly one <Sidebar> in the shared shell
  const coreShell = read("components", "shell", "CoreAppShell.tsx");
  assert.equal((coreShell.match(/<Sidebar\b/g) ?? []).length, 1, "CoreAppShell must render exactly one Sidebar — /app and /admin must not each carry their own");
  assert.equal(exists("app", "admin", "(shell)", "Sidebar.tsx"), false, "/admin must not have its own bespoke sidebar file");
  assert.equal(exists("app", "app", "Sidebar.tsx"), false, "/app must not have its own bespoke sidebar file");

  // =========================================================================
  // CRM
  // =========================================================================

  // --- 6. Real crm_leads render — the list API reads the real table -------
  const leadsRepo = read("packages", "leads-and-crm", "src", "repository.ts");
  assert.ok(/\.from\(["']crm_leads["']\)/.test(leadsRepo), "leads-and-crm repository must read the real crm_leads table");
  const crmWorkspace = read("components", "crm", "CrmWorkspace.tsx");
  assert.ok(/\/api\/platform\/leads\?tenantId=/.test(crmWorkspace), "CrmWorkspace must fetch real leads through the existing tenant-scoped leads API");

  // --- 7. WhatsApp source renders ------------------------------------------
  const conversationRow = read("components", "crm", "ConversationRow.tsx");
  assert.ok(/whatsapp:\s*["']WhatsApp["']/.test(conversationRow), "ConversationRow must label whatsapp-sourced leads as WhatsApp");

  // --- 8. Website inquiries are preserved, not lost -----------------------
  const adminLeadsPage = read("app", "admin", "(shell)", "leads", "page.tsx");
  assert.ok(/stratxcel_contact_messages/.test(adminLeadsPage), "Admin Leads page must still read stratxcel_contact_messages — website inquiries must not be lost");
  const adminLeadsTabs = read("app", "admin", "(shell)", "leads", "AdminLeadsTabs.tsx");
  assert.ok(/Website inquiries/.test(adminLeadsTabs), "Admin Leads must surface website inquiries as a clearly labeled secondary tab");
  assert.ok(/CrmWorkspace/.test(adminLeadsTabs), "Admin Leads' primary tab must be the same shared CrmWorkspace, not a separate admin-only CRM implementation");

  // --- 9. Lead search works -------------------------------------------------
  const conversationList = read("components", "crm", "ConversationList.tsx");
  assert.ok(/contact_name/.test(conversationList) && /contact_phone/.test(conversationList) && /contact_email/.test(conversationList), "search must match name, phone, and email");
  assert.ok(/last_message_preview/.test(conversationList), "search must also match recent message text where feasible");

  // --- 10. Filters work (All/Unread/Mine/Unassigned — not an enterprise builder)
  for (const key of ['"all"', '"unread"', '"mine"', '"unassigned"']) {
    assert.ok(conversationList.includes(key), `ConversationList must implement the ${key} filter`);
  }
  assert.equal(/FilterBuilder|advancedFilter|customQuery/i.test(conversationList), false, "must stay a simple fixed filter set, not a complex filter builder");

  // =========================================================================
  // CONVERSATIONS
  // =========================================================================

  // --- 11/12. Real whatsapp_conversations + whatsapp_messages tables used --
  const messagesLib = read("packages", "whatsapp", "src", "messages.ts");
  assert.ok(/\.from\(["']whatsapp_conversations["']\)/.test(messagesLib), "must read the real whatsapp_conversations table");
  assert.ok(/\.from\(["']whatsapp_messages["']\)/.test(messagesLib), "must read the real whatsapp_messages table");
  assert.ok(/\/api\/platform\/whatsapp\/conversations\$\{|\/api\/platform\/whatsapp\/conversations\?tenantId=/.test(crmWorkspace), "CrmWorkspace must fetch the real conversations list");
  assert.ok(/\/api\/platform\/whatsapp\/conversations\/\$\{conversationId\}/.test(crmWorkspace), "CrmWorkspace must fetch real per-conversation messages");

  // --- 13. No primary shadow-message dependency ----------------------------
  // Matches actual usage (a fetch call, a table reference, a field access) —
  // not bare substring presence, since these files' own doc comments
  // legitimately mention "whatsapp_shadow_messages" by name to explain that
  // it's deliberately NOT used here.
  for (const file of ["CrmWorkspace.tsx", "ConversationList.tsx", "ConversationRow.tsx", "ChatThread.tsx", "ChatBubble.tsx", "types.ts"]) {
    const src = read("components", "crm", file);
    assert.equal(/["'`]\/api\/platform\/whatsapp\/shadow-messages|\.from\(["']whatsapp_shadow_messages["']\)|\.would_send\b/.test(src), false, `components/crm/${file} must never depend on the shadow-message diagnostics source`);
  }

  // --- 14. Inbound/outbound bubble mapping is correct -----------------------
  const chatBubble = read("components", "crm", "ChatBubble.tsx");
  assert.ok(/outbound = message\.direction === ["']outbound["']/.test(chatBubble), "bubble side must be derived only from the real message.direction field");
  assert.ok(/justify-end.*justify-start|justify-start.*justify-end/s.test(chatBubble) || (/justify-end/.test(chatBubble) && /justify-start/.test(chatBubble)), "must render distinct left/right alignment for inbound vs outbound");

  // --- 15. Delivery statuses render ------------------------------------------
  for (const status of ["queued", "sent", "delivered", "read", "failed"]) {
    assert.ok(chatBubble.includes(`"${status}"`), `ChatBubble's delivery indicator must handle the real "${status}" status`);
  }

  // --- 16. Unread badge renders ----------------------------------------------
  assert.ok(/unread_count/.test(conversationRow), "ConversationRow must render the real unread_count");
  assert.ok(/conversation\?\.unread_count/.test(conversationList) || /unread_count/.test(conversationList), "unread filter must use the real unread_count field");

  // --- 17. Opening a conversation marks it read; UI reflects zero unread ---
  const conversationDetailRoute = read("app", "api", "platform", "whatsapp", "conversations", "[id]", "route.ts");
  assert.ok(/markConversationRead/.test(conversationDetailRoute), "GET /api/platform/whatsapp/conversations/[id] must still mark the conversation read server-side");
  assert.ok(/setConversations.*unread_count:\s*0/s.test(crmWorkspace), "selecting a conversation must optimistically zero its unread badge in the UI, not just server-side");
  assert.equal(/Read state isn.t tracked yet/.test(crmWorkspace + conversationList), false, "must never claim read state isn't tracked — whatsapp_conversations.unread_count is real");

  // --- 18. Automation-mode control uses the existing PATCH API -------------
  const conversationHeader = read("components", "crm", "ConversationHeader.tsx");
  assert.ok(/Take over|Resume automation/.test(conversationHeader), "header must offer a take-over / resume-automation control");
  assert.ok(/automationMode/.test(crmWorkspace) && /PATCH/.test(crmWorkspace), "automation mode changes must go through the existing PATCH conversations/[id] route, not a new one");

  // =========================================================================
  // SECURITY
  // =========================================================================

  // --- 19. Tenant isolation maintained ---------------------------------------
  // Every fetch() call must carry tenantId somewhere — either in the URL
  // (GET requests) or in the request body (PATCH/POST requests, matching
  // each route's own contract, e.g. PATCH conversations/[id] reads tenantId
  // from the JSON body, not a query param). Checked over each call's next
  // ~400 chars (covers multi-line fetch(url, { method, headers, body }) calls)
  // rather than just the URL template literal alone.
  const fetchStarts = [...crmWorkspace.matchAll(/fetch\(/g)].map((m) => m.index);
  assert.ok(fetchStarts.length > 0, "CrmWorkspace must issue tenant-scoped fetches");
  for (const start of fetchStarts) {
    const chunk = crmWorkspace.slice(start, start + 400);
    assert.ok(/tenantId/.test(chunk), `every CrmWorkspace fetch must be tenant-scoped: ${chunk.slice(0, 80)}…`);
  }
  const sendCallBody = crmWorkspace.match(/JSON\.stringify\(\{ tenantId,[^}]*leadId[^}]*\}\)/g) ?? [];
  assert.ok(sendCallBody.length > 0, "the outbound send call must include tenantId + leadId in its body, matching the API's own re-verification");

  // --- 20. RBAC maintained ----------------------------------------------------
  assert.ok(/can\(role, ["']crm:manage["']\)/.test(crmWorkspace), "lead-management controls must be gated by the real crm:manage permission");
  assert.ok(/can\(role, ["']whatsapp:send["']\)/.test(crmWorkspace), "the composer must be gated by the real whatsapp:send permission");
  const leadDetailsPanel = read("components", "crm", "LeadDetailsPanel.tsx");
  assert.ok(/canManage/.test(leadDetailsPanel), "LeadDetailsPanel must respect the canManage gate passed down from CrmWorkspace, not assume every viewer can edit");

  // --- 21. Service-role key never sent client-side ----------------------------
  for (const file of fs.readdirSync(path.join(root, "components", "crm")).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))) {
    const src = read("components", "crm", file);
    assert.equal(
      /SUPABASE_SERVICE_ROLE_KEY|createSupabaseServiceClient|getTenantServiceContext/.test(src),
      false,
      `components/crm/${file} is client-rendered and must never reference a service-role client`
    );
  }

  // =========================================================================
  // RESPONSIVE
  // =========================================================================

  // --- 22. Mobile list -> chat -> details navigation is usable ---------------
  assert.ok(/mobileView/.test(crmWorkspace), "CrmWorkspace must track which mobile-level view is active");
  assert.ok(/setMobileView\(["']thread["']\)/.test(crmWorkspace), "selecting a conversation must advance to the full-screen thread view on mobile");
  assert.ok(/onBack/.test(crmWorkspace) && /setMobileView\(["']list["']\)/.test(crmWorkspace), "the conversation header's back action must return to the list view on mobile");
  assert.ok(/md:hidden/.test(crmWorkspace) || /md:flex/.test(crmWorkspace), "the workspace must actually switch layout at the md breakpoint, not just declare mobile state unused");
  assert.ok(/Modal/.test(crmWorkspace), "lead details must be reachable as a mobile bottom sheet (Modal), not require desktop width");

  console.log(
    "unified-crm-inbox.test.ts: ALL PASS (canonical nav model, admin-only gating, active-route resolution, no duplicate sidebars, real crm_leads/conversations/messages, website inquiries preserved, search/filters, bubble mapping, delivery statuses, unread behavior, automation control, tenant isolation, RBAC, no client-side service-role, mobile navigation)"
  );
}

run();
