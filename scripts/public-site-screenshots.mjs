/**
 * Visual QA harness for the public marketing site.
 *
 * Renders each public route at the responsive breakpoints we support, writes a
 * full-page screenshot per combination, and reports horizontal overflow so a
 * reviewer can spot layout breaks without opening every page by hand.
 *
 *   node scripts/public-site-screenshots.mjs [baseUrl] [outDir]
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.argv[2] ?? "http://localhost:3311";
const OUT_DIR = process.argv[3] ?? path.join(process.cwd(), ".screenshots");

const ROUTES = [
  ["home", "/"],
  ["products", "/products"],
  ["solutions", "/solutions"],
  ["pricing", "/pricing"],
  ["how-it-works", "/how-it-works"],
  ["audit", "/audit"],
  ["security", "/security"],
  ["experience", "/experience"],
  ["product-proof", "/product-proof"],
  ["agents", "/agents"],
  ["system", "/system"],
  ["solution-detail", "/solutions/restaurants-cafes"],
];

const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(",").map((w) => Number(w.trim()))
  : [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
if (!executablePath) {
  console.error("No Chrome/Edge binary found. Set CHROME_PATH.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath, args: ["--force-color-profile=srgb"] });
const findings = [];

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: width < 700 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width < 700,
    hasTouch: width < 700,
  });
  const page = await context.newPage();

  for (const [name, route] of ROUTES) {
    const url = `${BASE_URL}${route}`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    } catch {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    }
    await page.waitForTimeout(700);

    const report = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowing = [];
      const viewport = doc.clientWidth;
      for (const el of document.querySelectorAll("body *")) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.right > viewport + 1 || rect.left < -1) {
          const style = getComputedStyle(el);
          if (style.position === "fixed" && style.pointerEvents === "none") continue;
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className?.baseVal ?? el.className ?? "").toString().slice(0, 110),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          });
        }
      }
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: viewport,
        overflowing: overflowing.slice(0, 6),
      };
    });

    if (report.scrollWidth > report.clientWidth + 1) {
      findings.push({ name, width, ...report });
    }

    await page.screenshot({
      path: path.join(OUT_DIR, `${name}-${width}.png`),
      fullPage: true,
    });
  }

  await context.close();
  console.log(`captured ${width}px`);
}

await browser.close();

if (findings.length) {
  console.log("\nHORIZONTAL OVERFLOW:");
  for (const f of findings) {
    console.log(`  ${f.name} @ ${f.width}: scrollWidth=${f.scrollWidth} clientWidth=${f.clientWidth}`);
    for (const el of f.overflowing) console.log(`     <${el.tag} class="${el.cls}"> ${el.left}..${el.right}`);
  }
  process.exitCode = 1;
} else {
  console.log("\nNo horizontal overflow at any tested width.");
}
