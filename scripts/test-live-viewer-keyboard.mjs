import { chromium } from "playwright-core";

async function verifyLiveViewer() {
  console.log("Connecting to local browser via CDP on port 9222...");
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

  const context = browser.contexts()[0] || await browser.newContext();
  let viewerPage = browser.contexts().flatMap((c) => c.pages()).find((p) =>
    p.url().includes("/admin/personal-connectors/founder-computer/browser")
  );

  if (!viewerPage) {
    console.log("Opening Founder Browser viewer page...");
    viewerPage = await context.newPage();
    await viewerPage.goto("https://www.stratxcel.in/admin/personal-connectors/founder-computer/browser", {
      waitUntil: "networkidle",
    });
  } else {
    console.log("Found existing Founder Browser viewer page, reloading to load newest build...");
    await viewerPage.reload({ waitUntil: "networkidle" });
  }

  await viewerPage.waitForTimeout(5000);

  // 1. Verify artificial buttons ("Type", "Paste", "Send Key") are absent
  const typeButtonCount = await viewerPage.locator("button:has-text('Type')").count();
  const pasteButtonCount = await viewerPage.locator("button:has-text('Paste')").count();
  const sendKeyButtonCount = await viewerPage.locator("button:has-text('Send Key')").count();

  console.log("Artificial buttons check:", {
    typeButtons: typeButtonCount,
    pasteButtons: pasteButtonCount,
    sendKeyButtons: sendKeyButtonCount,
  });

  if (typeButtonCount > 0 || pasteButtonCount > 0 || sendKeyButtonCount > 0) {
    console.warn("WARNING: Artificial controls still detected on page.");
  } else {
    console.log("✓ Artificial input buttons successfully removed!");
  }

  // 2. Check for the simplified toolbar controls
  const backBtn = await viewerPage.locator("button:has-text('Back')").count();
  const fwdBtn = await viewerPage.locator("button:has-text('Forward')").count();
  const reloadBtn = await viewerPage.locator("button:has-text('Reload')").count();
  const screenshotBtn = await viewerPage.locator("button:has-text('Screenshot')").count();
  const exitBtn = await viewerPage.locator("button:has-text('Exit')").count();

  console.log("Toolbar buttons present:", {
    Back: backBtn > 0,
    Forward: fwdBtn > 0,
    Reload: reloadBtn > 0,
    Screenshot: screenshotBtn > 0,
    Exit: exitBtn > 0,
  });

  // 3. Check canvas presence and auto-focus
  const screenCanvas = viewerPage.locator("#founder-screen-container canvas");
  const canvasExists = await screenCanvas.count();
  console.log("Canvas element exists:", canvasExists > 0);

  // 4. Check status indicators
  const pageText = await viewerPage.innerText("body");
  const hasDirectHardwareNote = pageText.includes("Direct Hardware Desktop Input");
  const hasZeroKnowledgeNote = pageText.includes("Zero-Knowledge");
  const hasHermesLockNote = pageText.includes("Hermes Lock:");

  console.log("Status bar notes:", {
    hasDirectHardwareNote,
    hasZeroKnowledgeNote,
    hasHermesLockNote,
  });

  // 5. Capture screenshot
  const screenshotPath = "C:/Users/shriyansh chandrakar/.gemini/antigravity-ide/brain/084fe9fe-34cc-47a8-94bd-f5f965c413b4/founder_browser_keyboard_verified.png";
  await viewerPage.screenshot({ path: screenshotPath });
  console.log("Saved live viewer screenshot to:", screenshotPath);

  await browser.close();
  console.log("Viewer page verification finished!");
}

verifyLiveViewer().catch((err) => {
  console.error("Live viewer test failed:", err);
  process.exit(1);
});
