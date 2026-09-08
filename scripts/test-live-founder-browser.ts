import {
  getFounderComputerRuntimeStatus,
  executeBrowserAction,
  executeComputerAction,
  listActiveTabs,
} from "@stratxcel/connectors";
import assert from "node:assert/strict";

async function main() {
  console.log("--- STARTING FOUNDER BROWSER LIVE E2E VERIFICATION ---");

  // 1. Probe runtime status
  const status = await getFounderComputerRuntimeStatus();
  console.log("Runtime status:", {
    state: status.state,
    cdpUrl: status.cdpUrl,
    browserVersion: status.browserVersion,
    activePages: status.activePages,
    profileDir: status.profileDir,
  });

  assert.equal(status.state, "RUNNING", "Browser runtime must be RUNNING");
  assert.ok(status.browserVersion?.includes("Chrome"), "Browser version must be detected");

  // 2. Tab listing
  const tabs = await listActiveTabs();
  console.log(`Found ${tabs.length} active tabs. Top tab:`, tabs[0]?.title ?? "none");
  assert.ok(tabs.length > 0, "At least one active tab must exist");

  // 3. Harmless Navigation to example.com
  console.log("Testing browser.navigate to https://example.com ...");
  const navResult = await executeBrowserAction("browser.navigate", {
    url: "https://example.com",
    waitUntil: "domcontentloaded",
  });
  console.log("Navigate result:", navResult.success ? "SUCCESS" : "FAILED", navResult.url);
  assert.equal(navResult.success, true, "Navigation must succeed");

  // 4. browser.read on harmless element
  console.log("Testing browser.read on h1 ...");
  const readResult = await executeBrowserAction("browser.read", { selector: "h1" });
  console.log("Read result text:", readResult.text);
  assert.equal(readResult.success, true, "Read must succeed");
  assert.ok((readResult.text as string)?.includes("Example Domain"), "Heading must contain 'Example Domain'");

  // 5. browser.screenshot
  console.log("Testing browser.screenshot ...");
  const shotResult = await executeBrowserAction("browser.screenshot", { format: "base64", fullPage: false });
  assert.equal(shotResult.success, true, "Screenshot must succeed");
  assert.ok(typeof shotResult.base64 === "string" && (shotResult.base64 as string).length > 100, "Screenshot base64 must be non-empty");
  console.log(`Screenshot captured: ${(shotResult.base64 as string).substring(0, 40)}... (length: ${(shotResult.base64 as string).length})`);

  // 6. browser.scroll
  console.log("Testing browser.scroll ...");
  const scrollResult = await executeBrowserAction("browser.scroll", { direction: "down", amount: 150 });
  assert.equal(scrollResult.success, true, "Scroll must succeed");

  // 7. browser.wait
  console.log("Testing browser.wait (timeout) ...");
  const waitResult = await executeBrowserAction("browser.wait", { condition: "timeout", timeoutMs: 300 });
  assert.equal(waitResult.success, true, "Wait must succeed");

  // 8. browser.click on harmless anchor
  console.log("Testing browser.click on 'a' ...");
  const clickResult = await executeBrowserAction("browser.click", { selector: "a", timeoutMs: 3000 });
  console.log("Click result:", clickResult.success ? "SUCCESS" : "FAILED");
  assert.equal(clickResult.success, true, "Click must succeed");

  // 9. browser.key
  console.log("Testing browser.key ...");
  const keyResult = await executeBrowserAction("browser.key", { key: "PageDown" });
  assert.equal(keyResult.success, true, "Key press must succeed");

  // 10. Navigate back to example.com
  await executeBrowserAction("browser.navigate", { url: "https://example.com" });

  // 11. browser.tabs list
  console.log("Testing browser.tabs action ...");
  const tabsResult = await executeBrowserAction("browser.tabs", { action: "list" });
  assert.equal(tabsResult.success, true, "Tabs list must succeed");

  // 12. computer.wait
  console.log("Testing computer.wait ...");
  const compWaitResult = await executeComputerAction("computer.wait", { ms: 100 });
  assert.equal(compWaitResult.success, true, "Computer wait must succeed");

  console.log("\n✓ LIVE BROWSER RUNTIME AND HERMES PRIMITIVES FULLY OPERABLE!");
}

main().catch((err) => {
  console.error("Live test failed:", err);
  process.exit(1);
});
