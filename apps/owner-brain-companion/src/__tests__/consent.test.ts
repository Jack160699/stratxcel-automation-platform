// Run with: node --experimental-strip-types apps/owner-brain-companion/src/__tests__/consent.test.ts
import assert from "node:assert/strict";
import { applyConsent } from "../consent.ts";

function run() {
  const raw = { appName: "Code.exe", windowTitle: "secret-project.ts - Visual Studio Code" };

  assert.equal(applyConsent(raw, { collectActiveApp: false, collectWindowTitle: true }), null, "collectActiveApp=false must drop the signal entirely, even if collectWindowTitle is true");

  const appOnly = applyConsent(raw, { collectActiveApp: true, collectWindowTitle: false });
  assert.deepEqual(appOnly, { appName: "Code.exe", windowTitle: null }, "default consent (no window-title opt-in) must strip the title, keeping only the app name");

  const withTitle = applyConsent(raw, { collectActiveApp: true, collectWindowTitle: true });
  assert.deepEqual(withTitle, { appName: "Code.exe", windowTitle: raw.windowTitle }, "explicit opt-in must pass the title through unchanged");

  console.log("consent.test.ts (owner-brain-companion): ALL PASS (no covert collection, title stripped by default, explicit opt-in honored)");
}

run();
