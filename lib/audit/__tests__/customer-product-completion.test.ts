import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPresenceLinks, isSafeHttpUrl } from "../v1/presence.ts";
import { mapAuditWhatsAppFailureReason, getOrCreateAuditShareUrl, sendAuditReportWhatsApp } from "../v1/whatsapp-send.ts";
import { buildBrandBrainContentFromAuditIntake } from "../brand-brain.ts";
import { resolvePlatformWhatsAppSender } from "@stratxcel/whatsapp";
import { createFakeSupabase } from "../../../packages/whatsapp/src/__tests__/support/fake-supabase.ts";
import { isCorePlatformCodingDenied, createEngineeringBrief } from "../../hermes/operating-brain.ts";
import { assertWebStudioPathAllowed, requiresOwnerApproval } from "../../hermes/coding-boundary.ts";
import { delegateHermesSpecialist } from "../../hermes/specialists.ts";
import { canRemoveMember, canChangeMemberRole, hashInviteToken } from "../../tenants/invitations.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => readFileSync(path.join(root, ...parts), "utf8");

async function run() {
  const overlay = read("components", "ui", "Overlay.tsx");
  assert.match(overlay, /onCloseRef/);
  assert.match(overlay, /FIELD_FOCUSABLE/);
  assert.match(overlay, /}, \[open\]\);/);
  assert.doesNotMatch(overlay, /}, \[open, onClose\]\);/);

  assert.equal(mapAuditWhatsAppFailureReason("no_active_outbound_binding").status, "SENDER_NOT_CONFIGURED");
  assert.equal(mapAuditWhatsAppFailureReason("kill_switch_active:whatsapp").status, "SENDER_NOT_CONFIGURED");
  assert.equal(mapAuditWhatsAppFailureReason("template_required_outside_service_window").status, "TEMPLATE_REQUIRED");
  assert.equal(mapAuditWhatsAppFailureReason("consent_required").status, "NO_CONSENT");
  assert.doesNotMatch(mapAuditWhatsAppFailureReason("sender_not_configured").message, /try again later/i);

  const { client } = createFakeSupabase({
    whatsapp_phone_bindings: [{
      id: "platform-binding",
      tenant_id: "platform-tenant",
      status: "active",
      outbound_enabled: true,
      source: "cloud_api",
      phone_number_id: "12345",
    }],
  });
  const originalPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
  delete process.env.STRATXCEL_WHATSAPP_PLATFORM_BINDING_ID;
  delete process.env.STRATXCEL_WHATSAPP_PLATFORM_TENANT_ID;
  try {
    const sender = await resolvePlatformWhatsAppSender(client);
    assert.equal(sender.ok, true);
    if (sender.ok) {
      assert.equal(sender.sender.bindingId, "platform-binding");
      assert.equal(sender.sender.tenantId, "platform-tenant");
    }
  } finally {
    if (originalPhone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone;
  }

  const isolatedCustomer = createFakeSupabase({
    audit_whatsapp_destinations: [{
      id: "dest-1",
      tenant_id: "customer-tenant",
      user_id: "user-1",
      lead_id: "lead-1",
      e164: "+919876543210",
      consent_opted_in: true,
      consent_withdrawn_at: null,
    }],
    contact_consent: [{ tenant_id: "customer-tenant", lead_id: "lead-1", channel: "whatsapp", opted_in: true, opted_out_at: null }],
    whatsapp_phone_bindings: [{
      id: "platform-binding",
      tenant_id: "platform-tenant",
      status: "active",
      outbound_enabled: true,
      source: "cloud_api",
      phone_number_id: "12345",
    }],
    crm_leads: [{ id: "lead-1", tenant_id: "customer-tenant", last_interaction_at: new Date().toISOString() }],
    kill_switches: [],
    whatsapp_templates: [],
    audit_delivery_events: [],
  });
  const originalPhoneIsolated = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
  let missingCustomerBinding;
  try {
    missingCustomerBinding = await sendAuditReportWhatsApp(isolatedCustomer.client, {
    tenantId: "customer-tenant",
    orderId: "order-1",
    businessName: "Stratxcel",
    reportUrl: "https://www.stratxcel.in/audit/share/abc",
    sendOutbound: async (_supabase, input) => {
      assert.equal(input.senderPhoneBindingId, "platform-binding");
      assert.equal(input.tenantId, "customer-tenant");
      return { ok: true, messageId: "msg-1", alreadySent: false, providerId: "wamid.PLATFORM", mode: "live" };
    },
    });
    assert.equal(missingCustomerBinding.status, "SENT");
    assert.equal(missingCustomerBinding.providerMessageId, "wamid.PLATFORM");
  } finally {
    if (originalPhoneIsolated === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneIsolated;
  }

  const shareClient = createFakeSupabase({
    audit_share_tokens: [{
      id: "tok-1",
      tenant_id: "tenant-1",
      audit_order_id: "order-1",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
    }],
    audit_delivery_events: [{
      tenant_id: "tenant-1",
      audit_order_id: "order-1",
      channel: "share",
      detail: "https://www.stratxcel.in/audit/share/reused-token",
      created_at: new Date().toISOString(),
    }],
  });
  const reused = await getOrCreateAuditShareUrl(shareClient.client, { tenantId: "tenant-1", orderId: "order-1", userId: "user-1" });
  assert.equal(reused, "https://www.stratxcel.in/audit/share/reused-token");

  const links = buildPresenceLinks({
    websiteUrl: "https://www.stratxcel.in",
    onlineProfiles: ["https://instagram.com/stratxcel"],
    verifiedPublicTypes: ["website", "instagram"],
    whatsappDeliveryMasked: "••••••9780",
  });
  const website = links.find((item) => item.key === "website");
  const instagram = links.find((item) => item.key === "instagram");
  const whatsapp = links.find((item) => item.key === "whatsapp");
  assert.ok(website?.href?.includes("stratxcel.in"));
  assert.ok(website?.handle?.includes("stratxcel.in"));
  assert.ok(instagram?.href?.includes("instagram.com/stratxcel"));
  assert.equal(whatsapp?.public, false);
  assert.equal(whatsapp?.href, null);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("https://www.stratxcel.in"), true);

  const customerOwned = buildBrandBrainContentFromAuditIntake({
    id: "audit-1",
    website_url: "https://audit-supplied.example",
    social_links: ["https://instagram.com/from-audit"],
    deep_dive_answers: { intakeMeta: { updatedAt: "2026-08-13T00:00:00.000Z" } },
  }, {
    website_url: "https://customer-edited.example",
    audit_synced_website_url: "https://old-audit.example",
    online_profiles: ["https://instagram.com/customer"],
    audit_synced_online_profiles: ["https://instagram.com/from-audit"],
  });
  assert.equal(customerOwned.website_url, "https://customer-edited.example");
  assert.deepEqual(customerOwned.online_profiles, ["https://instagram.com/customer"]);

  const onboarding = read("app", "api", "platform", "audit", "onboarding", "route.ts");
  assert.match(onboarding, /syncBrandBrainPresence/);
  assert.match(onboarding, /action === "save_connect"/);

  assert.equal(isCorePlatformCodingDenied("modify Stratxcel core app authentication"), true);
  assert.equal(isCorePlatformCodingDenied("create a landing page for the spring sale"), false);
  const brief = createEngineeringBrief({ missingCapability: "core platform coding", goal: "rewrite Hermes core" });
  assert.equal(brief.kind, "ENGINEERING_REQUIRED");
  assert.equal(assertWebStudioPathAllowed("/tmp/stratxcel-web-studio/site").ok, true);
  assert.equal(assertWebStudioPathAllowed("c:/Users/me/stratxcel-automation-platform/app/layout.tsx").ok, false);
  assert.equal(requiresOwnerApproval("charges and payment mutations"), true);
  assert.equal(delegateHermesSpecialist("Create a website"), "web_studio");
  assert.equal(delegateHermesSpecialist("Audit my SEO"), "audit");

  const lastOwner = canRemoveMember({ actorsRole: "owner", targetRole: "owner", ownerCount: 1 });
  assert.equal(lastOwner.ok, false);
  if (!lastOwner.ok) assert.equal(lastOwner.reason, "LAST_OWNER");
  assert.equal(canChangeMemberRole({ actorsRole: "admin", currentRole: "viewer", nextRole: "admin", ownerCount: 1 }).ok, false);
  assert.equal(canChangeMemberRole({ actorsRole: "owner", currentRole: "viewer", nextRole: "owner", ownerCount: 1 }).ok, false);
  assert.notEqual(hashInviteToken("abc"), "abc");

  const nav = read("components", "shell", "MobileBottomNav.tsx");
  assert.match(nav, /Modal open=\{moreOpen\}/);
  assert.doesNotMatch(nav, /Drawer/);
  assert.match(nav, />More</);

  const copilot = read("app", "app", "copilot", "page.tsx");
  assert.match(copilot, /POST.*api\/platform\/missions|fetch\("\/api\/platform\/missions"/s);
  assert.match(copilot, /ENGINEERING_REQUIRED/);
  assert.match(copilot, /Activity/);
  assert.match(copilot, /xl:hidden/);

  const missions = read("app", "api", "platform", "missions", "route.ts");
  assert.match(missions, /delegateHermesSpecialist/);
  assert.match(missions, /ENGINEERING_REQUIRED/);

  const integrations = read("app", "app", "integrations", "page.tsx");
  assert.match(integrations, /GoogleSearchIntegrationPanel/);
  assert.match(integrations, /Staff-assisted|staff-assisted|Not connected|Needs attention/);

  const teamInvite = read("app", "api", "platform", "team", "invites", "route.ts");
  assert.match(teamInvite, /token_hash/);
  assert.doesNotMatch(teamInvite, /role === "owner"|role: "owner"/);

  const visual = read("app", "app", "audit", "VisualAuditReport.tsx");
  assert.match(visual, /healthUnsupported/);
  assert.match(visual, /Not enough verified data/);

  console.log("customer-product-completion.test.ts: PASS");
}

await run();
