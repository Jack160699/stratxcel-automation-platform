import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolvePlatformWhatsAppSender } from "../platform-sender.ts";
import {
  buildMetaGraphUrl,
  inspectMetaTemplateEndpoint,
  MetaTemplateEndpointError,
} from "../templates/meta-api.ts";
import { isTemplateUsable, listTemplatesForTenant, syncTemplatesForBinding } from "../templates/sync.ts";
import { createFakeSupabase } from "./support/fake-supabase.ts";

async function run() {
  const original = {
    bindingId: process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID,
    mode: process.env.WHATSAPP_INTEGRATION_MODE,
    token: process.env.WHATSAPP_TOKEN,
    apiVersion: process.env.WHATSAPP_GRAPH_API_VERSION,
  };
  process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID = "platform-binding";
  process.env.WHATSAPP_INTEGRATION_MODE = "live";
  process.env.WHATSAPP_TOKEN = "test-token";
  process.env.WHATSAPP_GRAPH_API_VERSION = "v26.0";

  try {
    const fake = createFakeSupabase({
      whatsapp_phone_bindings: [
        {
          id: "platform-binding",
          tenant_id: "platform-tenant",
          waba_id: "platform-waba",
          phone_number_id: "platform-phone",
          display_phone_number: "+91 77778 12777",
          provider_account_ref: "Stratxcel",
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
    assert.equal(resolved.sender.phoneNumberId, "platform-phone");

    const requestedUrls: string[] = [];
    const result = await syncTemplatesForBinding(
      fake.client,
      {
        tenantId: resolved.sender.tenantId,
        phoneBindingId: resolved.sender.bindingId,
        wabaId: resolved.sender.wabaId,
        phoneNumberId: resolved.sender.phoneNumberId,
      },
      async (url) => {
        requestedUrls.push(String(url));
        if (String(url).includes("/phone_numbers")) {
          return Response.json({ data: [{ id: "platform-phone", verified_name: "Stratxcel" }] });
        }
        if (!String(url).includes("/message_templates")) {
          return Response.json({ id: "platform-waba", name: "Stratxcel WABA" });
        }
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
    assert.equal(requestedUrls.length, 3);
    assert.equal(
      requestedUrls[0],
      buildMetaGraphUrl("v26.0", "platform-waba", undefined, new URLSearchParams({ fields: "id,name" })),
    );
    assert.match(requestedUrls[1] ?? "", /v26\.0\/platform-waba\/phone_numbers\?/);
    assert.match(requestedUrls[2] ?? "", /v26\.0\/platform-waba\/message_templates\?/);
    const templates = await listTemplatesForTenant(fake.client, "platform-tenant");
    assert.equal(templates.length, 1);
    assert.equal(templates[0]?.name, "audit_report_ready");
    assert.equal(templates[0]?.status, "APPROVED");
    assert.equal(await isTemplateUsable(fake.client, "platform-tenant", String(templates[0]?.id)), true);

    const wrongObjectCalls: string[] = [];
    const recovered = await syncTemplatesForBinding(
      fake.client,
      {
        tenantId: resolved.sender.tenantId,
        phoneBindingId: resolved.sender.bindingId,
        wabaId: "business-portfolio-object",
        phoneNumberId: resolved.sender.phoneNumberId,
      },
      async (url) => {
        const value = String(url);
        wrongObjectCalls.push(value);
        if (value.includes("business-portfolio-object?")) {
          return Response.json({ id: "business-portfolio-object", name: "Stratxcel Business" });
        }
        if (value.includes("business-portfolio-object/message_templates")) {
          return Response.json(
            { error: { message: "(#100) Tried accessing nonexisting field (message_templates)", code: 100 } },
            { status: 400 },
          );
        }
        if (value.includes("/owned_whatsapp_business_accounts")) {
          return Response.json({ data: [{ id: "real-platform-waba", name: "Stratxcel WhatsApp" }] });
        }
        if (value.includes("/client_whatsapp_business_accounts")) return Response.json({ data: [] });
        if (value.includes("real-platform-waba/phone_numbers")) {
          return Response.json({ data: [{ id: "platform-phone", verified_name: "Stratxcel" }] });
        }
        if (value.includes("real-platform-waba/message_templates")) {
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
        }
        return Response.json({ error: { message: "Unexpected test URL", code: 100 } }, { status: 400 });
      },
    );
    assert.deepEqual(recovered, { synced: 1, mode: "live" });
    assert.match(wrongObjectCalls.join("\n"), /owned_whatsapp_business_accounts/);
    assert.equal(fake.tables.whatsapp_phone_bindings[0]?.waba_id, "real-platform-waba");

    await assert.rejects(
      inspectMetaTemplateEndpoint(
        { wabaId: "old-version-waba", phoneNumberId: "platform-phone" },
        async (url) => {
          if (!String(url).includes("/message_templates")) {
            return Response.json({ id: "old-version-waba", name: "Stratxcel WABA" });
          }
          return Response.json(
            { error: { message: "This Graph API version is deprecated", code: 2635 } },
            { status: 400 },
          );
        },
      ),
      (error: unknown) =>
        error instanceof MetaTemplateEndpointError &&
        error.failure === "WRONG_API_VERSION" &&
        error.errorCode === 2635,
    );

    await assert.rejects(
      inspectMetaTemplateEndpoint(
        { wabaId: "wrong-object", phoneNumberId: "platform-phone" },
        async (url) => {
          if (String(url).includes("wrong-object?")) {
            return Response.json({ id: "wrong-object", name: "Not a WABA" });
          }
          if (String(url).includes("/owned_whatsapp_business_accounts") || String(url).includes("/client_whatsapp_business_accounts")) {
            return Response.json({ data: [] });
          }
          return Response.json(
            {
              error: {
                message: "(#100) Tried accessing nonexisting field (message_templates)",
                code: 100,
              },
            },
            { status: 400 },
          );
        },
      ),
      (error: unknown) =>
        error instanceof MetaTemplateEndpointError &&
        error.failure === "WRONG_OBJECT" &&
        error.errorCode === 100,
    );

    await assert.rejects(
      syncTemplatesForBinding(
        fake.client,
        {
          tenantId: resolved.sender.tenantId,
          phoneBindingId: resolved.sender.bindingId,
          wabaId: resolved.sender.wabaId,
          phoneNumberId: resolved.sender.phoneNumberId,
        },
        async () => Response.json({ error: { message: "Invalid OAuth access token", code: 190 } }, { status: 401 }),
      ),
      /HTTP 401 \(code 190; Invalid OAuth access token\)/,
    );

    const routeSource = readFileSync(resolve(process.cwd(), "app/api/platform/whatsapp/templates/route.ts"), "utf8");
    assert.match(routeSource, /resolvePlatformWhatsAppSender/);
    assert.doesNotMatch(routeSource, /listPhoneBindingsForTenant/);
  } finally {
    restore("STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID", original.bindingId);
    restore("WHATSAPP_INTEGRATION_MODE", original.mode);
    restore("WHATSAPP_TOKEN", original.token);
    restore("WHATSAPP_GRAPH_API_VERSION", original.apiVersion);
  }

  console.log("platform-template-sync.test.ts: ALL PASS");
}

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

run();
