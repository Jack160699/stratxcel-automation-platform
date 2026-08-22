import assert from "node:assert/strict";
import { normalizeWhatsAppDestination, maskWhatsAppNumber } from "../v1/e164.ts";
import { verifiedReviewsFromProfile } from "../v1/reviews.ts";
import { field } from "../v1/provenance.ts";
import { sendAuditReportWhatsApp, auditWhatsAppIdempotencyKey } from "../v1/whatsapp-send.ts";
import { createFakeSupabase } from "../../../packages/whatsapp/src/__tests__/support/fake-supabase.ts";
import { sendOutboundWhatsAppMessage } from "@stratxcel/whatsapp";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TENANT = "tenant-1";
const OTHER_TENANT = "tenant-2";
const LEAD_ID = "lead-1";
const ORDER_ID = "order-1";

function destinationTables() {
  return {
    crm_leads: [{
      id: LEAD_ID,
      tenant_id: TENANT,
      contact_phone: "+919876543210",
      normalized_phone: "919876543210",
      last_interaction_at: new Date().toISOString(),
    }],
    audit_whatsapp_destinations: [{
      id: "dest-1",
      tenant_id: TENANT,
      user_id: "user-1",
      lead_id: LEAD_ID,
      e164: "+919876543210",
      country_iso: "IN",
      national_number: "9876543210",
      consent_opted_in: true,
      consent_source: "audit_onboarding",
      consent_captured_at: new Date().toISOString(),
      consent_withdrawn_at: null,
    }],
    contact_consent: [{
      tenant_id: TENANT,
      lead_id: LEAD_ID,
      channel: "whatsapp",
      opted_in: true,
      opted_out_at: null,
    }],
    whatsapp_phone_bindings: [{
      id: "binding-1",
      tenant_id: TENANT,
      status: "active",
      outbound_enabled: true,
      source: "migrated_verified_bot",
      phone_number_id: "12345",
    }],
    kill_switches: [],
    whatsapp_templates: [],
    audit_delivery_events: [],
  };
}

async function withStubbedFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

async function run() {
  assert.equal(normalizeWhatsAppDestination("IN", "9876543210")?.e164, "+919876543210");
  assert.equal(normalizeWhatsAppDestination("IN", "+91 98765 43210")?.e164, "+919876543210");
  assert.equal(normalizeWhatsAppDestination("IN", "09876543210")?.e164, "+919876543210");
  assert.equal(normalizeWhatsAppDestination("US", "4155552671")?.e164, "+14155552671");
  assert.equal(normalizeWhatsAppDestination("IN", "123"), null);
  assert.equal(normalizeWhatsAppDestination("ZZ", "9876543210"), null);
  assert.equal(normalizeWhatsAppDestination("IN", "abcdefghij"), null);
  assert.equal(maskWhatsAppNumber("+919876543210"), "••••••3210");

  const verified = verifiedReviewsFromProfile({
    reviews: field({ rating: 4.2, count: 127 }, "VERIFIED_PUBLIC", "https://maps.google.com/?cid=1"),
  });
  assert.equal(verified?.rating, 4.2);
  assert.equal(verified?.count, 127);
  assert.equal(verifiedReviewsFromProfile({ reviews: field({ rating: 4.2, count: 10 }, "AI_INFERRED") }), null);
  assert.equal(verifiedReviewsFromProfile({}), null);

  const { client, tables } = createFakeSupabase(destinationTables());
  const none = await sendAuditReportWhatsApp(createFakeSupabase({
    ...destinationTables(),
    audit_whatsapp_destinations: [],
  }).client, {
    tenantId: TENANT,
    orderId: ORDER_ID,
    businessName: "Stratxcel",
    reportUrl: "https://www.stratxcel.in/audit/share/abc",
  });
  assert.equal(none.status, "NO_DESTINATION");

  const noConsent = await sendAuditReportWhatsApp(createFakeSupabase({
    ...destinationTables(),
    contact_consent: [{ tenant_id: TENANT, lead_id: LEAD_ID, channel: "whatsapp", opted_in: false, opted_out_at: new Date().toISOString() }],
    audit_whatsapp_destinations: [{
      ...destinationTables().audit_whatsapp_destinations[0]!,
      consent_opted_in: false,
      consent_withdrawn_at: new Date().toISOString(),
    }],
  }).client, {
    tenantId: TENANT,
    orderId: ORDER_ID,
    businessName: "Stratxcel",
    reportUrl: "https://www.stratxcel.in/audit/share/abc",
  });
  assert.equal(noConsent.status, "NO_CONSENT");

  const isolated = await sendAuditReportWhatsApp(client, {
    tenantId: OTHER_TENANT,
    orderId: ORDER_ID,
    businessName: "Other",
    reportUrl: "https://www.stratxcel.in/audit/share/abc",
  });
  assert.equal(isolated.status, "NO_DESTINATION");

  const originalMode = process.env.WHATSAPP_INTEGRATION_MODE;
  const originalToken = process.env.WHATSAPP_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_INTEGRATION_MODE = "live";
  process.env.WHATSAPP_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "12345";
  try {
    let fetchCalls = 0;
    const live = await withStubbedFetch(async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.TEST123" }] }), { status: 200 });
    }, () => sendAuditReportWhatsApp(createFakeSupabase(destinationTables()).client, {
      tenantId: TENANT,
      orderId: ORDER_ID,
      businessName: "Stratxcel",
      reportUrl: "https://www.stratxcel.in/audit/share/token",
      sendOutbound: sendOutboundWhatsAppMessage,
    }));
    assert.equal(live.status, "SENT");
    assert.equal(live.providerMessageId, "wamid.TEST123");
    assert.equal(fetchCalls, 1);
    assert.equal(live.alreadySent, false);

    const seeded = destinationTables();
    const { client: retryClient, tables: retryTables } = createFakeSupabase(seeded);
    await withStubbedFetch(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.FIRST" }] }), { status: 200 }), () =>
      sendAuditReportWhatsApp(retryClient, {
        tenantId: TENANT,
        orderId: ORDER_ID,
        businessName: "Stratxcel",
        reportUrl: "https://www.stratxcel.in/audit/share/token",
        sendOutbound: sendOutboundWhatsAppMessage,
      }));
    let secondCalls = 0;
    const retry = await withStubbedFetch(async () => {
      secondCalls += 1;
      return new Response(JSON.stringify({ messages: [{ id: "wamid.SECOND" }] }), { status: 200 });
    }, () => sendAuditReportWhatsApp(retryClient, {
      tenantId: TENANT,
      orderId: ORDER_ID,
      businessName: "Stratxcel",
      reportUrl: "https://www.stratxcel.in/audit/share/token",
      sendOutbound: sendOutboundWhatsAppMessage,
    }));
    assert.equal(retry.status, "SENT");
    assert.equal(retry.alreadySent, true);
    assert.equal(secondCalls, 0, "idempotent retry must not call the provider again");
    assert.equal(auditWhatsAppIdempotencyKey(ORDER_ID, "919876543210"), "audit_report_whatsapp:order-1:919876543210");
    assert.equal((retryTables.whatsapp_messages ?? []).length, 1);

    const failed = await withStubbedFetch(async () => new Response("nope", { status: 500 }), () =>
      sendAuditReportWhatsApp(createFakeSupabase(destinationTables()).client, {
        tenantId: TENANT,
        orderId: ORDER_ID,
        businessName: "Stratxcel",
        reportUrl: "https://www.stratxcel.in/audit/share/token",
        sendOutbound: sendOutboundWhatsAppMessage,
      }));
    assert.equal(failed.status, "FAILED");
    assert.notEqual(failed.providerMessageId, "wamid.TEST123");
  } finally {
    if (originalMode === undefined) delete process.env.WHATSAPP_INTEGRATION_MODE;
    else process.env.WHATSAPP_INTEGRATION_MODE = originalMode;
    if (originalToken === undefined) delete process.env.WHATSAPP_TOKEN;
    else process.env.WHATSAPP_TOKEN = originalToken;
    if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  }

  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  // AuditHubPage's rendering (including AuditShareDialog) moved into
  // AuditHubClient.tsx during fix(perf): eliminate client-side fetch
  // waterfall on Audit Hub — page.tsx is now just the server-side data loader.
  const page = readFileSync(path.join(root, "app", "app", "audit", "AuditHubClient.tsx"), "utf8");
  assert.match(page, /AuditShareDialog/);
  assert.doesNotMatch(page, /clipboard\.writeText/);
  assert.match(page, /navigator\.share|AuditShareDialog/);
  const overlay = readFileSync(path.join(root, "components", "ui", "Overlay.tsx"), "utf8");
  assert.match(overlay, /Escape/);
  assert.match(overlay, /onClick=\{onClose\}/);
  assert.match(overlay, /aria-modal/);
  assert.match(overlay, /onCloseRef/);
  assert.match(overlay, /}, \[open\]\);/);
  const icons = readFileSync(path.join(root, "components", "audit", "PlatformIcon.tsx"), "utf8");
  assert.match(icons, /aria-hidden="true"/);
  assert.match(icons, /Instagram/);
  assert.match(icons, /WhatsApp/);
  const nav = readFileSync(path.join(root, "components", "shell", "navigation", "app-nav-data.ts"), "utf8");
  // The canonical customer IA (feat(ia): implement canonical customer IA
  // (Home | Audit | Content | Growth | More) + full-screen multimodal Growth
  // Assistant) superseded the earlier "Growth Assistant" nav-data entry:
  // Growth Assistant is now a full-screen work mode entered from Home action
  // cards/quick tools, not a bottom-dock/nav-data href — verified below via
  // app/app/page.tsx instead. "Connected Accounts" is unchanged.
  assert.match(nav, /label: "Connected Accounts"/);
  assert.match(nav, /APP_MOBILE_NAV_KEYS = \["home", "customer-audit", "content", "growth"\]/);
  const home = readFileSync(path.join(root, "app", "app", "page.tsx"), "utf8");
  assert.match(home, /\/app\/social\/copilot/);
  const settings = readFileSync(path.join(root, "app", "app", "settings", "page.tsx"), "utf8");
  assert.doesNotMatch(settings, /Open Brand Brain/);
  assert.match(settings, /Appearance/);
  assert.equal(existsSync(path.join(root, "app", "api", "platform", "audit", "report", "email", "route.ts")), false);
  const worker = readFileSync(path.join(root, "apps", "mission-worker", "src", "worker.ts"), "utf8");
  assert.doesNotMatch(worker, /enqueueAuditDeliveredEmailBestEffort/);
  const visual = readFileSync(path.join(root, "app", "app", "audit", "VisualAuditReport.tsx"), "utf8");
  assert.match(visual, /reviews\.rating/);
  assert.match(visual, /Not enough verified data/);
  assert.doesNotMatch(visual, /Email report/);

  void tables;
  console.log("audit-ux-completion.test.ts: PASS");
}

await run();
