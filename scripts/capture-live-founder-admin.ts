import { executeBrowserAction } from "@stratxcel/connectors";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const artifactDir = "C:\\Users\\shriyansh chandrakar\\.gemini\\antigravity-ide\\brain\\084fe9fe-34cc-47a8-94bd-f5f965c413b4";

  console.log("Navigating to personal connectors...");
  await executeBrowserAction("browser.navigate", {
    url: "https://www.stratxcel.in/admin/personal-connectors",
    waitUntil: "domcontentloaded",
  });
  await new Promise((r) => setTimeout(r, 2500));

  console.log("Opening Founder Computer drawer...");
  await executeBrowserAction("browser.click", {
    selector: 'text="Founder Computer"',
    timeoutMs: 4000,
  });
  await new Promise((r) => setTimeout(r, 1200));

  // Step 1: Initialize Setup
  console.log("Clicking 'Initialize Setup' (Step 1)...");
  const initClick = await executeBrowserAction("browser.click", {
    selector: 'button:has-text("Initialize Setup")',
    timeoutMs: 4000,
  }).catch((e) => ({ success: false, error: String(e) }));
  console.log("Initialize click result:", initClick);
  await new Promise((r) => setTimeout(r, 2000));

  // Step 2: Probe Port 9222 to detect live running browser
  console.log("Clicking 'Probe Port 9222' (Step 2)...");
  const probeClick = await executeBrowserAction("browser.click", {
    selector: 'button:has-text("Probe Port 9222")',
    timeoutMs: 4000,
  }).catch((e) => ({ success: false, error: String(e) }));
  console.log("Probe click result:", probeClick);
  await new Promise((r) => setTimeout(r, 2000));

  // Capture Drawer Overview with live status
  console.log("Capturing Overview screenshot with active runtime state...");
  const shotOverview = await executeBrowserAction("browser.screenshot", { format: "base64", fullPage: false });
  if (shotOverview.base64 && typeof shotOverview.base64 === "string") {
    fs.writeFileSync(path.join(artifactDir, "fc_overview_active.png"), Buffer.from(shotOverview.base64, "base64"));
    console.log("Saved fc_overview_active.png");
  }

  // Switch to Diagnostics tab
  console.log("Switching to Diagnostics tab...");
  await executeBrowserAction("browser.click", {
    selector: 'button:has-text("Diagnostics")',
    timeoutMs: 4000,
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Click Test Hermes Browser Control button
  console.log("Clicking 'Test Hermes Browser Control' button...");
  const testClick = await executeBrowserAction("browser.click", {
    selector: 'button:has-text("Test Hermes Browser Control")',
    timeoutMs: 5000,
  }).catch((e) => ({ success: false, error: String(e) }));
  console.log("Test Hermes Browser Control click result:", testClick);

  // Wait 5 seconds for diagnostic execution
  console.log("Waiting for diagnostic result...");
  await new Promise((r) => setTimeout(r, 5000));

  // Capture Diagnostics screenshot showing result
  console.log("Capturing Diagnostics result screenshot...");
  const shotDiag = await executeBrowserAction("browser.screenshot", { format: "base64", fullPage: false });
  if (shotDiag.base64 && typeof shotDiag.base64 === "string") {
    fs.writeFileSync(path.join(artifactDir, "fc_diagnostics_live_result.png"), Buffer.from(shotDiag.base64, "base64"));
    console.log("Saved fc_diagnostics_live_result.png");
  }

  console.log("E2E LIVE FOUNDER COMPUTER ADMIN VERIFICATION COMPLETE!");
}

main().catch(console.error);
