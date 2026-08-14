import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePlatformWhatsAppSender } from "../platform-sender.ts";
import { isTemplateUsable, listTemplatesForTenant, syncTemplatesForBinding } from "../templates/sync.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";

async function run() {
  const original = {
    bindingId: process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID,
    mode: process.env.WHATSAPP_INTEGRATION_MODE,
    token: process.env.WHATSAPP_TOKEN,
  };
  process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID = "platform-binding";
  process.env.WHATSAPP_INTEGRATION_MODE = "live";
  process.env.WHATSAPP_TOKEN = "test-token";

  try {
    const fake = createFakeSupabase({
      whatsapp_phone_bindings: [
        {
          id: "platform-binding",
          tenant_id: "platform-tenant",
          waba_id: "platform-waba",
          phone_number_id: "platform-phone",
          status: "active",
          outbound_enabled: true,
          source: "cloud_api",
        },
      ],
      whatsapp_templates: [],
    });

    assert.equal(
      fake.tables.whatsapp_phone_bindings.some((row) => row.tenant_id === "customer-without-whatsapp"),
      false,
      "the customer tenant must not need a WhatsApp binding",
    );

    const resolved = await resolvePlatformWhatsAppSender(fake.client);
    assert.equal(resolved.ok, true);
    if (!resolved.ok) throw new Error("platform sender did not resolve");
    assert.equal(resolved.sender.wabaId, "platform-waba");

    const result = await syncTemplatesForBinding(
      fake.client,
      {
        tenantId: resolved.sender.tenantId,
        phoneBindingId: resolved.sender.bindingId,
        wabaId: resolved.sender.wabaId,
      },
      async (url) => {
        assert.match(String(url), /platform-waba\/message_templates/);
        return Response.json({
          data: [
            {
              id: "meta-template-1",
              name: "audit_report_ready",
              language: "en",
              category: "UTILITY",
              status: "APPROVED",
              components: [],
            },
          ],
        });
      },
    );

    assert.deepEqual(result, { synced: 1, mode: "live" });
    const templates = await listTemplatesForTenant(fake.client, "platform-tenant");
    assert.equal(templates.length, 1);
    assert.equal(templates[0]?.name, "audit_report_ready");
    assert.equal(templates[0]?.status, "APPROVED");
    assert.equal(await isTemplateUsable(fake.client, "platform-tenant", String(templates[0]?.id)), true);

    await assert.rejects(
      syncTemplatesForBinding(
        fake.client,
        {
          tenantId: resolved.sender.tenantId,
          phoneBindingId: resolved.sender.bindingId,
          wabaId: resolved.sender.wabaId,
        },
        async () =>
          Response.json(
            {
              error: {
                message: "Unsupported get request.",
                code: 100,
                error_subcode: 33,
                fbtrace_id: "safe-trace-id",
              },
            },
            { status: 400 },
          ),
      ),
      /HTTP 400 \(code 100; subcode 33; Unsupported get request\.; trace safe-trace-id\)/,
    );

    const routeSource = readFileSync(resolve(process.cwd(), "app/api/platform/whatsapp/templates/route.ts"), "utf8");
    assert.match(routeSource, /resolvePlatformWhatsAppSender/);
    assert.doesNotMatch(routeSource, /listPhoneBindingsForTenant/);
  } finally {
    restore("STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID", original.bindingId);
    restore("WHATSAPP_INTEGRATION_MODE", original.mode);
    restore("WHATSAPP_TOKEN", original.token);
  }

  console.log("platform-template-sync.test.ts: ALL PASS");
}

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

run();
