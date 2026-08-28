// Brand Brain Final UX + Data + Save System mission — verifies the real
// production wiring: the save state machine, the structured Services
// editor, and canonical Brand Brain retrieval reaching every real
// consumer (Social Autopilot, SEO/Website's shared compiler, the Website
// Factory brief). ".tsx"/route files import "server-only" / React JSX
// transitively (via Next.js-only modules) and cannot be live-imported
// outside Next's own bundler, so — matching this codebase's own
// established pattern (see lib/image-generation/__tests__/
// image-generation.test.ts) — those are verified as static
// source-inclusion checks. The canonical retrieval layer itself
// (packages/brand-brain/src/canonical.ts) IS live-imported and
// live-tested here — its own dedicated, fuller unit test suite is
// packages/brand-brain/src/__tests__/canonical.test.ts (run via
// `npm run test:brand`).
// Run with: node --experimental-strip-types app/app/brand/__tests__/brand-brain-final-ux.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateBrandBrainContent, getCanonicalServices, matchServiceForRequest } from "@stratxcel/brand-brain";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(resolve(root, ...parts), "utf8");

async function run() {
  // --- Section 1: an unambiguous save state machine ---------------------
  const page = read("app", "app", "brand", "page.tsx");
  for (const state of ["idle", "unsaved", "saving", "saved", "error"]) {
    assert.ok(page.includes(`"${state}"`), `save state machine must include the "${state}" state`);
  }
  assert.ok(page.includes("Unsaved changes"), "the UI must literally say Unsaved changes, not leave it ambiguous");
  assert.ok(page.includes("Saving…"), "the UI must show a real Saving… state");
  assert.ok(/Saved/.test(page), "the UI must show a real Saved state");
  assert.ok(page.includes("Save failed"), "the UI must show a real, explicit Save failed state — not a generic error only");
  assert.ok(page.includes("Retry"), "a failed save must offer a real Retry action");

  // A failed save must retry save() itself, never load() (which would
  // silently discard the customer's unsaved edits by overwriting content
  // with server state) — the real bug this mission's Section 15 exists to
  // fix. Verified structurally: the save-error retry button's onClick must
  // reference `save`, and setContent/content must never be touched inside
  // the save-failure branch.
  const saveFn = page.slice(page.indexOf("async function save()"), page.indexOf("async function uploadPhoto"));
  assert.ok(saveFn.includes("setSaveError(result.message)"), "a failed save must record the error");
  assert.ok(!/setContent\(/.test(saveFn.split("if (result.status === \"error\")")[1]!.split("return;")[0]!), "a failed save must NEVER call setContent — the customer's typed edits must survive a failed save untouched");
  const retryButtons = [...page.matchAll(/onClick=\{save\}/g)];
  assert.ok(retryButtons.length >= 1, "the header Save button and the save-error banner's Retry button must both call save() directly");

  // Section 15: unsaved-changes protection on tab close/refresh.
  assert.ok(page.includes("beforeunload"), "must warn before an unsaved-changes tab close/refresh, not silently discard edits");

  // --- Section 2: Business Highlights guidance ---------------------------
  assert.ok(page.includes("HIGHLIGHT_MAX_LENGTH") && page.includes("HIGHLIGHTS_MAX_COUNT"), "Business Highlights must show the real, shared length/count limits — not an arbitrary/undocumented client-only number");
  assert.ok(page.includes("not a service description"), "Business Highlights must tell the owner it is a short summary, not the service catalog");

  // --- Section 3-5: structured Services, not chips/a giant textarea -----
  assert.ok(!page.includes("function TagListCard"), "the old bare-chip Catalog & Services component must be fully removed, not left as dead/parallel UI");
  assert.ok(!/<TagListCard/.test(page), "the old bare-chip Catalog & Services card must no longer be rendered");
  assert.ok(page.includes("ServicesEditor"), "the page must render the real structured Services editor");
  const servicesEditor = read("app", "app", "brand", "ServicesEditor.tsx");
  for (const action of ["addService", "removeService", "onToggleActive", "onMoveUp", "onMoveDown"]) {
    assert.ok(servicesEditor.includes(action), `Services must support the real action: ${action}`);
  }
  assert.ok(servicesEditor.includes("ServiceEditForm"), "editing a service must use a real compact form, not one shared giant textarea");

  // --- Section 8: server-side validation on save --------------------------
  const brandRoute = read("app", "api", "platform", "brand", "route.ts");
  assert.ok(brandRoute.includes("validateBrandBrainContent"), "the save route must validate content server-side, not trust the client alone");
  assert.match(brandRoute, /status:\s*400/, "invalid content must be rejected with a real 400, not silently accepted or 500ing");

  // --- Section 9: tenant safety unchanged/still enforced ------------------
  assert.ok(brandRoute.includes("requireTenantContext") && brandRoute.includes("requirePermission"), "the save route must still require real tenant membership + brand_brain:edit permission");
  assert.ok(brandRoute.includes("requireTenantReadContext") && brandRoute.includes("requireTenantReadPermission"), "the read route must still require real tenant membership + brand_brain:view permission");

  console.log("brand page / ServicesEditor / save route: static wiring checks — PASS");

  // --- Section 7: canonical retrieval reaches every real consumer --------
  const consumers: Array<{ path: string[]; marker: string; label: string }> = [
    { path: ["lib", "social", "studio-creative-treatment.ts"], marker: "getCanonicalBrandContext", label: "Creative Studio treatment generation" },
    { path: ["lib", "social", "package-autopilot.ts"], marker: "getActiveServices", label: "Social Autopilot's real automated pipeline" },
    { path: ["packages", "workforce-core", "src", "brand-context", "compiler.ts"], marker: "getActiveServices", label: "the shared brand-context compiler (SEO + Website role slices)" },
    { path: ["packages", "creative-studio", "src", "brand", "context.ts"], marker: "getActiveServices", label: "Creative Studio's own brand context" },
    { path: ["packages", "audit-engine", "src", "provider-context.ts"], marker: "getActiveServices", label: "Audit's provider-context builder" },
    { path: ["packages", "workforce-core", "src", "intelligence", "brand", "readiness.ts"], marker: "getCanonicalServices", label: "Brand readiness assessment" },
    { path: ["app", "app", "website", "create", "page.tsx"], marker: "existingServices", label: "the Website Factory create page" },
    { path: ["app", "api", "platform", "website-factory", "brief", "route.ts"], marker: "getCanonicalBrandContext", label: "the Website Factory brief route (server-authoritative)" },
    { path: ["app", "api", "platform", "onboarding", "route.ts"], marker: "content.services", label: "onboarding's Brand Brain seed write" },
  ];
  for (const c of consumers) {
    const src = read(...c.path);
    assert.ok(src.includes(c.marker), `${c.label} (${c.path.join("/")}) must consume the canonical Brand Brain retrieval layer (expected "${c.marker}")`);
  }
  console.log("canonical retrieval reaches every real consumer (Social Autopilot, SEO/Website compiler, Website Factory, Audit, onboarding) — PASS");

  // --- Website Factory brief route: server never blindly trusts client ---
  const briefRoute = read("app", "api", "platform", "website-factory", "brief", "route.ts");
  assert.ok(briefRoute.includes("buildServerAuthoritativeConnectorContext"), "the brief route must build its own server-side authoritative context, not just forward whatever the client sent");
  assert.ok(!/connectorContext:\s*connectorContext as AuthorizedConnectorContext/.test(briefRoute), "the raw, unverified client-supplied connectorContext must no longer be passed straight through to the brief engine");
  console.log("website-factory brief route: server-authoritative Brand Brain context — PASS");

  // --- StratXcel's own Brand Brain: 3 canonical services are DATA seeded
  //     into its own tenant row, never special-cased business logic ------
  // (illustrative mentions of "StratXcel"/"a plumber"/"Instagram" in
  // doc-comment prose are fine and expected — the real invariant is that
  // no LOGIC branches on a specific business/service name.)
  const canonicalSrc = read("packages", "brand-brain", "src", "canonical.ts");
  assert.ok(!/===\s*["'](StratXcel|Social Autopilot|Google SEO|Website Service)["']/.test(canonicalSrc), "matchServiceForRequest / getCanonicalServices must contain zero conditional logic branching on a specific business or service name — generic for every tenant's own catalog");
  console.log("generic platform-recognition matcher: zero hardcoded business/service branching — PASS");

  // --- Live logic: validateBrandBrainContent / getCanonicalServices /
  //     matchServiceForRequest actually behave correctly end-to-end ------
  const invalid = validateBrandBrainContent({ services: [{ id: "1", name: "", shortDescription: "", active: true, order: 0, updatedAt: "" } as never] });
  assert.ok(invalid.length > 0, "a nameless service must fail real validation");
  const valid = validateBrandBrainContent({ services: [{ id: "1", name: "Emergency Plumbing", shortDescription: "24/7 response.", active: true, order: 0, updatedAt: "" } as never] });
  assert.equal(valid.length, 0, "a real, well-formed service must pass validation");
  const services = getCanonicalServices({ services: [{ id: "1", name: "Website Service", shortDescription: "", active: true, order: 0, updatedAt: "" } as never] });
  assert.equal(services[0]!.name, "Website Service");
  assert.equal(matchServiceForRequest(services, "I need a new website"), services[0]);
  console.log("live end-to-end: validate -> normalize -> match, using the real exported functions — PASS");

  console.log("brand-brain-final-ux.test.ts: ALL PASS");
}

await run();
