import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function read(...segments: string[]) {
  return fs.readFileSync(path.resolve(process.cwd(), ...segments), "utf-8");
}

async function run() {
  console.log("Starting StratXcel Customer App Bugfixes & Polish Test Suite...");

  // 1. ISSUE A: Growth Page Resilience & Outcomes
  const growthPage = read("app", "app", "growth", "page.tsx");
  assert.ok(growthPage.includes("Your Growth"), "Growth page header must be 'Your Growth'");
  assert.ok(growthPage.includes("What Improved"), "Must contain What Improved section");
  assert.ok(growthPage.includes("What Needs Attention"), "Must contain What Needs Attention section");
  assert.ok(growthPage.includes("Retry"), "Must contain a graceful Retry button on error");
  assert.ok(growthPage.includes("Back to Home"), "Must contain Back to Home link");
  assert.ok(growthPage.includes("loadData"), "Must use controlled loadData without crashing");
  // VERIFICATION INTEGRITY (2026-09-02): a real, live mislabeling was found
  // and fixed here -- PARTIALLY_COMPLETED missions (some sub-tasks did not
  // finish) were shown as an unqualified "Completed successfully" in the
  // "What Improved" card, identical to a genuinely COMPLETED one. Source-
  // text-checks that the fix is actually present, not just described.
  assert.ok(growthPage.includes('isPartial = m.state === "PARTIALLY_COMPLETED"'), "Must distinguish PARTIALLY_COMPLETED from COMPLETED before labeling a mission");
  assert.ok(growthPage.includes("some parts may need review"), "A partially completed mission must say so, not read as an unqualified success");
  // A second real gap in the same card family, fixed the same pass:
  // "What Needs Attention" used to be entirely generic/hardcoded, never
  // reflecting a real FAILED/BLOCKED/stalled mission. Source-text-checks
  // the real per-mission derivation and rendering are actually present.
  assert.ok(growthPage.includes("NEEDS_ATTENTION_STATES"), "What Needs Attention must be driven by real mission states, not hardcoded tips alone");
  assert.ok(growthPage.includes("needsAttentionMissions"), "Must derive a real list of missions that genuinely need attention");
  console.log("✓ Issue A: Growth page stability, error handling, and outcome architecture verified.");

  // 2. ISSUE B: Content Visuals & Media Resolution
  const contentPage = read("app", "app", "content", "page.tsx");
  const contentClient = read("app", "app", "content", "ContentLibraryClient.tsx");
  assert.ok(contentPage.includes("generatePosterSvg") || contentPage.includes("loadTenantMedia"), "Content page must resolve visual media and posters");
  assert.ok(contentPage.includes("imageUrl:"), "Content items must carry imageUrl for visual rendering");
  assert.ok(contentClient.includes("<img"), "Content client must render image previews");
  assert.ok(contentClient.includes("handleDownload"), "Must support creative saving/downloading");
  assert.ok(contentClient.includes("handleCopy"), "Must support caption copying");
  console.log("✓ Issue B: Content Library visual media, poster generation, and actions verified.");

  // 3. ISSUE C: Permanent Removal of Floating Ask Button
  const coreShell = read("components", "shell", "CoreAppShell.tsx");
  assert.equal(coreShell.includes("AskCopilotButton"), false, "AskCopilotButton must be permanently removed from CoreAppShell");
  assert.equal(coreShell.includes("Ask StratXcel"), false, "Floating Ask StratXcel label must be removed");
  console.log("✓ Issue C: Floating Ask button permanently removed from customer application.");

  // 4. ISSUE D & E: Growth Assistant Header, History Icon, Layout & Footer
  const assistantChat = read("app", "app", "social", "copilot", "GrowthAssistantChat.tsx");
  assert.ok(assistantChat.includes("<h1"), "Must render primary title");
  assert.ok(assistantChat.includes("Growth Assistant"), "Must have primary title 'Growth Assistant'");
  assert.ok(assistantChat.includes("Ask anything to grow your business"), "Must have secondary subtitle");
  assert.equal(assistantChat.includes("व्यापार सहायक"), false, "Must permanently remove व्यापार सहायक subtitle");
  assert.ok(assistantChat.includes('aria-label="Chat history"'), "Must use accessible Chat history label");
  assert.ok(assistantChat.includes('href="/app"'), "Back button must navigate back to /app (Home)");
  assert.ok(assistantChat.includes("100dvh"), "Must use 100dvh layout to ensure composer stays visible");
  assert.ok(assistantChat.includes("capture=\"environment\""), "Camera control must trigger environment capture");
  assert.ok(assistantChat.includes("accept=\"image/*,video/*\""), "Gallery control must trigger media selection");
  assert.ok(assistantChat.includes("toggleVoiceRecording"), "Voice recording control must exist");
  console.log("✓ Issues D & E: Growth Assistant 2-line header, clock history icon, 100dvh layout, and fixed composer verified.");

  // 5. ISSUE F: Brand Selector & Logo Management
  const tenantSwitcher = read("app", "app", "ClientTenantSwitcher.tsx");
  const brandPage = read("app", "app", "brand", "page.tsx");
  assert.ok(tenantSwitcher.includes("getInitials") || tenantSwitcher.includes("initials"), "Brand selector must compute brand initials fallback");
  assert.equal(tenantSwitcher.includes("🏪"), false, "Random storefront emoji must be removed from header selector");
  assert.ok(tenantSwitcher.includes("/app/brand"), "Brand selector drawer must link directly to /app/brand");
  // Pre-existing drift found live (unrelated to this session's own changes):
  // the real, current section heading is "Brand Identity — Logo & Brand
  // Mark" (confirmed directly against a real live tenant in the browser,
  // and against app/app/brand/page.tsx's own source) -- this assertion's
  // expected literal was stale against a real product copy change.
  assert.ok(brandPage.includes("Logo & Brand Mark"), "Brand Center must provide a dedicated Logo Management section");
  console.log("✓ Issue F: Interactive brand selector, initials fallback, and Brand Center logo management verified.");

  // 6. ISSUE G: Dark Mode System & Tokens
  const globalsCss = read("app", "globals.css");
  const themeProvider = read("components", "theme", "ThemeProvider.tsx");
  assert.ok(globalsCss.includes("sx-theme-dark") || globalsCss.includes(".dark"), "globals.css must define dark mode CSS tokens");
  // The dark background token used to be declared twice (an early, pre-@theme
  // block and this later, correctly-ordered one — see the html.sx-theme-dark
  // comment in globals.css); both targeted the same element at equal
  // specificity, so the later declaration (#06080c) already won the cascade
  // and was the only one ever actually rendered. The duplicate, wrongly
  // ordered #090d16 block has been removed as the fix for that documented
  // production bug — this now checks the one real, active token.
  assert.ok(globalsCss.includes("--sx-bg: #06080c"), "globals.css must specify dark background token");
  assert.ok(themeProvider.includes('classList.toggle("dark"'), "ThemeProvider must toggle dark class");
  assert.ok(themeProvider.includes('setAttribute("data-theme"'), "ThemeProvider must set data-theme attribute");
  console.log("✓ Issue G: Dark mode CSS variables, theme provider class toggles, and token mappings verified.");

  console.log("\n=======================================================");
  console.log("ALL CUSTOMER APP BUG-FIX & UX POLISH TESTS PASSED!");
  console.log("=======================================================");
}

run();
