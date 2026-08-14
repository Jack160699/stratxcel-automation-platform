import assert from "node:assert/strict";
import {
  autoResolvePlatformTemplates,
  ensureAuditReportTemplateApproved,
  listTemplatesForTenant,
} from "../templates/sync.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";

async function runTests() {
  console.log("Starting Platform Template Guard Test Suite...");

  // Save original env
  const origEnv = { ...process.env };
  process.env.WHATSAPP_INTEGRATION_MODE = "live";
  process.env.WHATSAPP_TOKEN = "fake-meta-token";
  process.env.WHATSAPP_GRAPH_API_VERSION = "v26.0";
  process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID = "bind_platform_1";

  try {
    // -------------------------------------------------------------------------
    // Case 1: Meta returns APPROVED, local DB empty -> auto-resolves & persists
    // -------------------------------------------------------------------------
    {
      const { client: supabase } = createFakeSupabase({
        whatsapp_phone_bindings: [
          {
            id: "bind_platform_1",
            tenant_id: "tnt_platform_1",
            source: "platform_shared_sender",
            waba_id: "waba_real_1",
            phone_number_id: "phone_real_1",
            status: "active",
            outbound_enabled: true,
            display_phone_number: "+91 99999 99999",
            provider_account_ref: "meta_act_1",
          },
        ],
        whatsapp_templates: [],
      });

      const fakeFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("/phone_numbers")) {
          return new Response(JSON.stringify({ data: [{ id: "phone_real_1", verified_name: "Stratxcel" }] }), { status: 200 });
        }
        if (url.includes("/message_templates")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "meta_tmpl_101",
                  name: "audit_report_ready",
                  language: "en",
                  category: "UTILITY",
                  status: "APPROVED",
                  components: [{ type: "BODY", text: "Your Audit report is ready: {{1}}" }],
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ id: "waba_real_1", name: "Stratxcel WABA" }), { status: 200 });
      };

      const res = await autoResolvePlatformTemplates(supabase, { fetchFn: fakeFetch });
      assert.equal(res.metaAvailable, true);
      assert.equal(res.templates.length, 1);
      assert.equal(res.templates[0].name, "audit_report_ready");
      assert.equal(res.templates[0].status, "APPROVED");

      // Verify persisted in DB
      const persisted = await listTemplatesForTenant(supabase, "tnt_platform_1");
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0].name, "audit_report_ready");
      assert.equal(persisted[0].status, "APPROVED");

      console.log("  ✓ Case 1: Meta APPROVED template automatically resolved and persisted to local DB");
    }

    // -------------------------------------------------------------------------
    // Case 2: Local template exists with stale status -> Meta APPROVED updates it
    // -------------------------------------------------------------------------
    {
      const { client: supabase } = createFakeSupabase({
        whatsapp_phone_bindings: [
          {
            id: "bind_platform_1",
            tenant_id: "tnt_platform_1",
            source: "platform_shared_sender",
            waba_id: "waba_real_1",
            phone_number_id: "phone_real_1",
            status: "active",
            outbound_enabled: true,
            display_phone_number: "+91 99999 99999",
            provider_account_ref: "meta_act_1",
          },
        ],
        whatsapp_templates: [
          {
            id: "local_tmpl_old",
            tenant_id: "tnt_platform_1",
            phone_binding_id: "bind_platform_1",
            name: "audit_report_ready",
            language: "en",
            category: "UTILITY",
            provider_template_id: "meta_tmpl_101",
            status: "PENDING", // Stale status
            components: [],
            synced_at: new Date(Date.now() - 3600000).toISOString(),
          },
        ],
      });

      const fakeFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("/phone_numbers")) {
          return new Response(JSON.stringify({ data: [{ id: "phone_real_1" }] }), { status: 200 });
        }
        if (url.includes("/message_templates")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "meta_tmpl_101",
                  name: "audit_report_ready",
                  language: "en",
                  category: "UTILITY",
                  status: "APPROVED", // Now approved
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ id: "waba_real_1" }), { status: 200 });
      };

      const res = await autoResolvePlatformTemplates(supabase, { forceRefresh: true, fetchFn: fakeFetch });
      assert.equal(res.templates[0].status, "APPROVED");

      const persisted = await listTemplatesForTenant(supabase, "tnt_platform_1");
      assert.equal(persisted[0].status, "APPROVED");

      console.log("  ✓ Case 2: Stale local status updated automatically to Meta APPROVED");
    }

    // -------------------------------------------------------------------------
    // Case 3: Customer tenant context -> Platform template is still resolved
    // -------------------------------------------------------------------------
    {
      const { client: supabase } = createFakeSupabase({
        whatsapp_phone_bindings: [
          {
            id: "bind_platform_1",
            tenant_id: "tnt_platform_1",
            source: "platform_shared_sender",
            waba_id: "waba_real_1",
            phone_number_id: "phone_real_1",
            status: "active",
            outbound_enabled: true,
            display_phone_number: "+91 99999 99999",
            provider_account_ref: "meta_act_1",
          },
        ],
        whatsapp_templates: [
          {
            id: "local_tmpl_1",
            tenant_id: "tnt_platform_1",
            phone_binding_id: "bind_platform_1",
            name: "audit_report_ready",
            language: "en",
            category: "UTILITY",
            provider_template_id: "meta_tmpl_101",
            status: "APPROVED",
            components: [],
            synced_at: new Date().toISOString(),
          },
        ],
      });

      // Querying platform templates does not require customer tenant id
      const res = await autoResolvePlatformTemplates(supabase);
      assert.equal(res.templates.length, 1);
      assert.equal(res.templates[0].name, "audit_report_ready");
      assert.equal(res.senderStatus, "CONFIGURED");

      console.log("  ✓ Case 3: Platform template resolves independently of customer tenant context");
    }

    // -------------------------------------------------------------------------
    // Case 4: Meta temporarily unavailable -> returns previously verified template with offline indicator
    // -------------------------------------------------------------------------
    {
      const lastSync = new Date(Date.now() - 120000).toISOString();
      const { client: supabase } = createFakeSupabase({
        whatsapp_phone_bindings: [
          {
            id: "bind_platform_1",
            tenant_id: "tnt_platform_1",
            source: "platform_shared_sender",
            waba_id: "waba_real_1",
            phone_number_id: "phone_real_1",
            status: "active",
            outbound_enabled: true,
            display_phone_number: "+91 99999 99999",
            provider_account_ref: "meta_act_1",
          },
        ],
        whatsapp_templates: [
          {
            id: "local_tmpl_cached",
            tenant_id: "tnt_platform_1",
            phone_binding_id: "bind_platform_1",
            name: "audit_report_ready",
            language: "en",
            category: "UTILITY",
            provider_template_id: "meta_tmpl_101",
            status: "APPROVED",
            components: [],
            synced_at: lastSync,
          },
        ],
      });

      const failingFetch: typeof fetch = async () => {
        throw new Error("Meta Graph API 500 Internal Server Error");
      };

      const res = await autoResolvePlatformTemplates(supabase, { forceRefresh: true, fetchFn: failingFetch });
      assert.equal(res.metaAvailable, false);
      assert.equal(res.source, "cached_db");
      assert.equal(res.templates.length, 1);
      assert.equal(res.templates[0].name, "audit_report_ready");
      assert.equal(res.templates[0].status, "APPROVED");
      assert.equal(res.lastVerifiedAt, lastSync);

      console.log("  ✓ Case 4: Meta offline gracefully falls back to cached verified template record");
    }

    // -------------------------------------------------------------------------
    // Case 5: Meta reports REJECTED -> ensureAuditReportTemplateApproved blocks send
    // -------------------------------------------------------------------------
    {
      const { client: supabase } = createFakeSupabase({
        whatsapp_phone_bindings: [
          {
            id: "bind_platform_1",
            tenant_id: "tnt_platform_1",
            source: "platform_shared_sender",
            waba_id: "waba_real_1",
            phone_number_id: "phone_real_1",
            status: "active",
            outbound_enabled: true,
            display_phone_number: "+91 99999 99999",
            provider_account_ref: "meta_act_1",
          },
        ],
        whatsapp_templates: [],
      });

      const rejectedFetch: typeof fetch = async (input) => {
        const url = String(input);
        if (url.includes("/phone_numbers")) {
          return new Response(JSON.stringify({ data: [{ id: "phone_real_1" }] }), { status: 200 });
        }
        if (url.includes("/message_templates")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "meta_tmpl_101",
                  name: "audit_report_ready",
                  language: "en",
                  status: "REJECTED", // Meta rejected template
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ id: "waba_real_1" }), { status: 200 });
      };

      const auditCheck = await ensureAuditReportTemplateApproved(supabase, rejectedFetch);
      assert.equal(auditCheck.approved, false);
      assert.match(auditCheck.reason ?? "", /REJECTED/);

      console.log("  ✓ Case 5: Meta REJECTED template correctly blocks Audit outbound delivery");
    }

    console.log("\nALL 5 PLATFORM TEMPLATE GUARD TESTS PASS!");
  } finally {
    process.env = origEnv;
  }
}

void runTests();
