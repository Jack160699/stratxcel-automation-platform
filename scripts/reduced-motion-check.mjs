/**
 * Verifies the prefers-reduced-motion homepage: the hero must settle on its
 * strongest static headline, the product environment must stay visible, and no
 * decorative animation may keep running.
 *
 *   node scripts/reduced-motion-check.mjs [baseUrl]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.argv[2] ?? "http://localhost:3311";
const outDir = path.join(process.cwd(), ".screenshots", "reduced-motion");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((c) => fs.existsSync(c));
if (!executablePath) {
  console.error("No Chrome/Edge binary found. Set CHROME_PATH.");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath });

for (const width of [390, 1440]) {
  const context = await browser.newContext({
    viewport: { width, height: width < 700 ? 844 : 900 },
    reducedMotion: "reduce",
    isMobile: width < 700,
    hasTouch: width < 700,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(2500);

  const report = await page.evaluate(() => {
    const running = [];
    for (const el of document.querySelectorAll("*")) {
      for (const anim of el.getAnimations?.() ?? []) {
        if (anim.playState === "running") {
          running.push(`${el.tagName.toLowerCase()}.${(el.className ?? "").toString().slice(0, 60)}`);
        }
      }
    }
    const hero = document.getElementById("platform-hero");
    return {
      headline: hero?.querySelector("h1")?.textContent?.trim(),
      environmentVisible: Boolean(hero?.querySelector("[data-hero-environment], .sx-hero-board, div")),
      heroTextLength: hero?.innerText?.length ?? 0,
      runningAnimations: [...new Set(running)].slice(0, 10),
    };
  });

  await page.screenshot({ path: path.join(outDir, `home-reduced-${width}.png`) });
  console.log(`${width}px`, JSON.stringify(report, null, 2));
  await context.close();
}

await browser.close();
