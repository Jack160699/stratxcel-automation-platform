import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { normalizeBusinessWebsiteInput, normalizeChannelValue, UnsafeBusinessUrlError, assertSafePublicHttpUrl } from "../v1/url.ts";
import { sanitizeChannels } from "../v1/channels.ts";
import { pickHighestTruth, field } from "../v1/provenance.ts";
import { selectAdaptiveQuestions, adaptiveAnswersComplete } from "../v1/adaptive-questions.ts";
import { overallScoreFromCategories, categoryScoreOrInsufficient } from "../v1/scoring.ts";
import { parseOnboardingState, isV1OnboardingComplete, resumeStep } from "../v1/onboarding-state.ts";
import { discoverPublicBusiness } from "../v1/discovery.ts";
import { isMissingRelation } from "../current-pointer.ts";

assert.equal(normalizeBusinessWebsiteInput("xyzconsultants.in"), "https://xyzconsultants.in");
assert.equal(normalizeBusinessWebsiteInput("www.xyzconsultants.in"), "https://www.xyzconsultants.in");
assert.equal(normalizeBusinessWebsiteInput("https://xyzconsultants.in"), "https://xyzconsultants.in");
assert.equal(normalizeBusinessWebsiteInput("http://xyzconsultants.in/"), "http://xyzconsultants.in");
assert.throws(() => normalizeBusinessWebsiteInput("javascript:alert(1)"), UnsafeBusinessUrlError);
assert.throws(() => normalizeBusinessWebsiteInput("ftp://files.example"), UnsafeBusinessUrlError);
assert.throws(() => normalizeBusinessWebsiteInput("http://localhost"), UnsafeBusinessUrlError);
assert.match(normalizeChannelValue("instagram", "@acme"), /instagram.com\/acme/);

await assert.rejects(() => assertSafePublicHttpUrl("http://127.0.0.1"), UnsafeBusinessUrlError);
await assert.rejects(() => assertSafePublicHttpUrl("http://192.168.1.20"), UnsafeBusinessUrlError);
await assert.rejects(() => assertSafePublicHttpUrl("http://169.254.1.2"), UnsafeBusinessUrlError);
const privateResolver = (async () => [{ address: "10.0.0.8", family: 4 }]) as unknown as typeof import("node:dns/promises").lookup;
await assert.rejects(() => assertSafePublicHttpUrl("https://evil.example", privateResolver), UnsafeBusinessUrlError);

const channels = sanitizeChannels([
  { type: "instagram", value: "https://instagram.com/x", notAvailable: false },
  { type: "instagram", value: "dup", notAvailable: false },
  { type: "nope", value: "x" },
]);
assert.equal(channels.length, 1);

const verified = field("Acme", "VERIFIED_PUBLIC", "https://acme.example");
const customer = field("Acme Pvt", "CUSTOMER_PROVIDED", undefined, true);
assert.equal(pickHighestTruth(verified, customer).value, "Acme Pvt");
assert.equal(pickHighestTruth(customer, field("AI name", "AI_INFERRED")).value, "Acme Pvt");

const rich = selectAdaptiveQuestions({
  name: field("Stratxcel", "VERIFIED_PUBLIC"),
  services: field(["Audit", "CRM"], "VERIFIED_PUBLIC"),
  audience: field("SMB owners", "VERIFIED_PUBLIC"),
  websiteUrl: "https://www.stratxcel.in",
});
assert.ok(rich.length >= 3 && rich.length <= 5);
const sparse = selectAdaptiveQuestions({});
assert.ok(sparse.length >= 3 && sparse.length <= 7);
assert.equal(adaptiveAnswersComplete(rich, { biggestGrowthProblem: "leads", ninetyDayResult: "pipeline", leadStuck: "follow-up" }), true);
assert.equal(adaptiveAnswersComplete(rich, { biggestGrowthProblem: "not_sure", ninetyDayResult: "skipped", leadStuck: "not_sure" }), true);

assert.equal(categoryScoreOrInsufficient(80, false), null);
assert.equal(categoryScoreOrInsufficient(80, true), 80);
assert.equal(overallScoreFromCategories([70, 80], 0.2).readinessOnly, true);
assert.equal(overallScoreFromCategories([70, 80, 90], 0.5).score, 80);

const state = parseOnboardingState({
  v1Experience: {
    flowVersion: "connect_discover_v1",
    step: "verify",
    websiteUrl: "https://www.stratxcel.in",
    channels: [],
    verified: true,
    profile: {
      name: field("Stratxcel", "VERIFIED_PUBLIC"),
      services: field(["Audit", "CRM"], "VERIFIED_PUBLIC"),
      audience: field("SMB owners", "VERIFIED_PUBLIC"),
    },
    adaptiveAnswers: { biggestGrowthProblem: "leads", ninetyDayResult: "demos", leadStuck: "handoff" },
    updatedAt: new Date().toISOString(),
  },
});
assert.equal(isV1OnboardingComplete(state), true);
assert.equal(resumeStep({ ...state!, websiteUrl: "" }), "connect");
assert.equal(resumeStep({ ...state!, verified: false, adaptiveAnswers: {} }), "verify");
assert.equal(resumeStep({ ...state!, profile: undefined, adaptiveAnswers: {} }), "discovering");

const html = `<html><head><title>Stratxcel</title><meta name="description" content="Growth operations for small businesses"><script type="application/ld+json">{"@type":"Organization","name":"Stratxcel","sameAs":["https://www.instagram.com/stratxcel"]}</script></head><body><h1>Stratxcel</h1></body></html>`;
const publicResolver = (async () => [{ address: "93.184.216.34", family: 4 }]) as unknown as typeof import("node:dns/promises").lookup;
const fetcher = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("robots.txt") || url.includes("sitemap.xml")) return new Response("User-agent: *\nDisallow:", { status: 200, headers: { "content-type": "text/plain" } });
  if (url.includes("/login")) return new Response("auth", { status: 200, headers: { "content-type": "text/html" } });
  if (url.includes("/private.pdf")) return new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } });
  if (url.includes("/gone")) return new Response(null, { status: 302, headers: { location: "https://evil.example/x" } });
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}) as typeof fetch;
const packet = await discoverPublicBusiness({
  websiteUrl: "https://www.stratxcel.in",
  fetcher,
  resolver: publicResolver,
});
assert.equal(packet.profile.name?.value, "Stratxcel");
assert.equal(packet.profile.name?.sourceClass, "VERIFIED_PUBLIC");
assert.ok(packet.evidence.some((item) => item.sourceClass === "VERIFIED_PUBLIC"));
assert.equal(packet.coverage.website, true);
assert.equal(packet.coverage.analytics, false);
assert.ok(!packet.pagesFetched.some((page) => page.url.includes("evil.example")));

assert.equal(isMissingRelation({ code: "PGRST205" }), true);
assert.equal(isMissingRelation(null), false);

const migration = readFileSync(new URL("../../../supabase/migrations/20260813180000_audit_v1_experience.sql", import.meta.url), "utf8");
assert.match(migration, /audit_reset_snapshots/);
assert.match(migration, /reset_audit_product_eligibility_v1/);
assert.match(migration, /claim_fresh_product_grant_audit_v1/);
assert.match(migration, /product_grant/);
assert.match(migration, /audit_has_verified_fulfilment/);
assert.doesNotMatch(migration, /delete from public\.audit_orders/i);
assert.doesNotMatch(migration, /delete from public\.promo_redemptions/i);
assert.doesNotMatch(migration, /delete from public\.payment_/i);
assert.match(migration, /grant select, insert on public\.audit_reset_snapshots to service_role/);
assert.doesNotMatch(migration, /grant select on public\.audit_reset_snapshots to authenticated/);
assert.match(migration, /on conflict \(audit_order_id, brand_brain_version\) do nothing/);

const shareRoute = readFileSync(new URL("../../../app/api/platform/audit/report/share/route.ts", import.meta.url), "utf8");
assert.match(shareRoute, /createAuditShareUrl/);
assert.match(shareRoute, /ownedCompletedAudit/);
assert.doesNotMatch(shareRoute, /tenant_id: body/);
const pdfRoute = readFileSync(new URL("../../../app/api/platform/audit/report/pdf/route.ts", import.meta.url), "utf8");
assert.match(pdfRoute, /ownedCompletedAudit/);
assert.match(pdfRoute, /application\/pdf/);
const owned = readFileSync(new URL("../../../app/api/platform/audit/report/_owned.ts", import.meta.url), "utf8");
assert.match(owned, /eq\("tenant_id", tenantId\)/);
    const emailRouteExists = existsSync(new URL("../../../app/api/platform/audit/report/email/route.ts", import.meta.url));
    assert.equal(emailRouteExists, false, "Audit email report endpoint must be removed");
const liveEngine = readFileSync(new URL("../../../packages/audit-engine/src/live.ts", import.meta.url), "utf8");
assert.match(liveEngine, /mergeFirstPartyDiscoverySources/);
assert.match(liveEngine, /audit_discovery_snapshots/);
const whatsappRoute = readFileSync(new URL("../../../app/api/platform/audit/report/whatsapp/route.ts", import.meta.url), "utf8");
assert.match(whatsappRoute, /sendAuditReportWhatsApp/);
assert.match(whatsappRoute, /NO_DESTINATION/);
assert.match(whatsappRoute, /NO_CONSENT/);
assert.doesNotMatch(whatsappRoute, /status: "queued"/);
assert.doesNotMatch(whatsappRoute, /status: "completed"/);
const theme = readFileSync(new URL("../../../components/theme/ThemeProvider.tsx", import.meta.url), "utf8");
assert.match(theme, /useSyncExternalStore/);
assert.match(theme, /sx-theme-dark/);
assert.match(theme, /localStorage\.setItem\(STORAGE_KEY, next\)/);
const globalsCss = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
assert.match(globalsCss, /html\.sx-theme-dark/);
assert.match(globalsCss, /html\.sx-theme-light/);
assert.ok(globalsCss.indexOf("@theme inline") < globalsCss.indexOf("html.sx-theme-dark"));
const checkout = readFileSync(new URL("../../../app/api/platform/audit/checkout/route.ts", import.meta.url), "utf8");
assert.match(checkout, /freshAuditEligible/);
assert.match(checkout, /generation/);
assert.doesNotMatch(checkout, /fulfilment_source: "product_grant"/);
const onboarding = readFileSync(new URL("../../../app/api/platform/audit/onboarding/route.ts", import.meta.url), "utf8");
assert.match(onboarding, /discoverPublicBusiness/);
assert.match(onboarding, /start_automatic_audit_generation_v1/);
const connect = readFileSync(new URL("../../../app/app/audit/ConnectExperience.tsx", import.meta.url), "utf8");
assert.match(connect, /Connect your business/);
assert.match(connect, /Add business channel/);
assert.match(connect, /Looks right/);
assert.match(connect, /Not sure/);
assert.match(connect, /WhatsAppDestinationField/);
assert.doesNotMatch(connect, /\bqueue\b/);
const reportUi = readFileSync(new URL("../../../app/app/audit/VisualAuditReport.tsx", import.meta.url), "utf8");
assert.match(reportUi, /Download PDF/);
assert.match(reportUi, /Send to WhatsApp/);
assert.match(reportUi, /max-w-4xl/);
assert.doesNotMatch(reportUi, /Email report/);
assert.match(reportUi, /PlatformIcon/);
const shareUi = readFileSync(new URL("../../../components/audit/AuditShareDialog.tsx", import.meta.url), "utf8");
assert.match(shareUi, /navigator\.share/);
assert.match(shareUi, /Copy secure link/);
assert.match(shareUi, /Link copied/);
assert.doesNotMatch(shareUi, /Email/);

console.log("audit-v1-experience.test.ts: PASS");
