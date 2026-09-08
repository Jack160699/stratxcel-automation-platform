// Run with: node --experimental-strip-types lib/audit/__tests__/whatsapp-send-simplification.test.ts
//
// Final Customer Experience Repair mission, Section 3 (WhatsApp Audit
// Delivery Simplification). AuditHubClient.tsx is a "use client" component
// with hooks that only resolve in a browser/Next.js runtime -- asserted
// against source, same convention as every other client-component test in
// this build. The real fix (a client/server payload-shape mismatch) is
// verified by comparing both files' actual field-access patterns.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

function run() {
  const hub = read("app", "app", "audit", "AuditHubClient.tsx");
  const route = read("app", "api", "platform", "audit", "report", "whatsapp", "route.ts");

  // --- 1. Real bug fix: client must send the NESTED shape the server
  //     actually reads, never the old flat one that silently dropped a
  //     brand-new customer's freshly-typed number every time. -----------
  assert.ok(/body\.destination\?\.nationalNumber/.test(route), "server contract: nationalNumber must be read from body.destination");
  assert.ok(
    /destination: \{ countryIso: payload\.countryIso, nationalNumber: payload\.nationalNumber \}, consent: payload\.consent/.test(hub),
    "client must POST the nested { destination: { countryIso, nationalNumber }, consent } shape the route actually reads -- the old flat shape meant body.destination was always undefined server-side"
  );
  assert.equal(
    /body: JSON\.stringify\(payload\)/.test(hub),
    false,
    "must never again POST the raw flat payload object directly"
  );

  // --- 2. Direct send when already connected -- no dialog, no extra choice
  assert.ok(
    /if \(waMasked\) \{\s*void handleSendWhatsApp\(\);/.test(hub),
    "an already-connected WhatsApp destination must send directly with no dialog at all"
  );
  assert.equal(
    /waDialog\(waMasked \? "consent" : "number"\)/.test(hub),
    false,
    "the old two-choice dialog trigger (number vs consent) must be gone"
  );
  assert.ok(/const \[waDialog, setWaDialog\] = useState<"number" \| null>\(null\)/.test(hub), "the dialog state must no longer have a separate 'consent' mode -- only first-time number entry");

  // --- 3. Omitting the payload for a direct send must be a real, valid,
  //     handled server case -- never silently rejected -------------------
  assert.ok(
    /async function handleSendWhatsApp\(payload\?: \{ nationalNumber: string; countryIso: string; consent: boolean \}\)/.test(hub),
    "payload must be optional -- the direct-send path calls this with none at all"
  );
  assert.ok(/body: JSON\.stringify\(\s*payload\s*\?/.test(hub), "must branch on whether a real payload was given, sending an empty body for the direct-send case");
  // The route's own existing-destination fallback (the `else` branch after
  // destination/consent checks) is what makes an empty body a real, valid
  // "use what's already stored" request -- not a new server change needed.
  assert.ok(/const existing = await loadAuditWhatsAppDestination\(ctx\.service, ctx\.tenantId\);/.test(route), "the route's real existing-destination fallback must still be in place for the empty-body direct-send case");

  // --- 4. First-time setup (genuinely no destination yet) still works,
  //     with the real, full payload ---------------------------------------
  assert.ok(
    /onSend=\{\(\) => void handleSendWhatsApp\(\{ countryIso: waCountry, nationalNumber: waNational, consent: waConsent \}\)\}/.test(hub),
    "the first-time number-entry dialog must still send the real typed destination"
  );

  console.log("whatsapp-send-simplification.test.ts: ALL PASS (direct send when connected, real client/server payload-shape bug fixed, first-time setup preserved)");
}

run();
