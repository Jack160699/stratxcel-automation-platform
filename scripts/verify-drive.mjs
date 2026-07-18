import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3105";
const OUT = process.env.SHOT_DIR ?? "./verify-shots";
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("[drive]", ...a);
const shot = (page, name) =>
  page.screenshot({ path: `${OUT}/${name}.png` }).then(() => log("shot", name));

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=default", "--enable-webgl", "--hide-scrollbars"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) log("console", m.type(), m.text());
});
page.on("pageerror", (e) => log("PAGEERROR", e.message));

// ——— 1. Home: press-start gate ———
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
await shot(page, "01-gate");
const gl = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  return c ? `${c.width}x${c.height}` : "NO CANVAS";
});
log("canvas:", gl);

// ——— 2. Press start ———
await page.getByRole("button", { name: /press\s*start/i }).click();
await page.waitForTimeout(2200);
await shot(page, "02-identity");

// ——— 3. Scroll through the journey ———
const marks = [
  [0.18, "03-chaos"],
  [0.3, "04-cap-web"],
  [0.42, "05-cap-late"],
  [0.55, "06-agent"],
  [0.7, "07-cases"],
  [0.82, "08-ecosystem"],
  [1.0, "09-explore"],
];
for (const [frac, name] of marks) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.lenis?.scrollTo ? null : null;
    window.scrollTo({ top: max * f, behavior: "instant" });
  }, frac);
  await page.waitForTimeout(1800);
  await shot(page, name);
}

// ——— 4. Contact form in finale ———
const suffix = Date.now();
await page.fill('input[name="name"]', "Verify Bot");
await page.fill('input[name="email"]', `verify-${suffix}@example.com`);
await page.fill('textarea[name="message"]', `End-to-end verification message ${suffix}.`);
await page.getByRole("button", { name: /send transmission/i }).click();
await page.waitForTimeout(2500);
const formResult = await page.textContent("[data-scene='explore']");
log("form result contains success:", /Transmission received/.test(formResult));
await shot(page, "10-form-submitted");

// ——— 5. Marketing page + contact page ———
await page.goto(BASE + "/system", { waitUntil: "networkidle" });
await shot(page, "11-system-page");
await page.goto(BASE + "/contact", { waitUntil: "networkidle" });
await shot(page, "12-contact-page");

// ——— 6. Admin: login + inbox shows the message ———
await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
await shot(page, "13-admin-login");
// probe: wrong password first
await page.fill('input[name="email"]', "admin@stratxcel.ai");
await page.fill('input[name="password"]', "wrong-password");
await page.getByRole("button", { name: /open console/i }).click();
await page.waitForTimeout(1500);
const badLogin = await page.textContent("body");
log("wrong password rejected:", /Invalid credentials/.test(badLogin));
// real login
await page.fill('input[name="password"]', process.env.ADMIN_PASSWORD);
await page.getByRole("button", { name: /open console/i }).click();
await page.waitForTimeout(3500);
const adminBody = await page.textContent("body");
log("admin sees inbox:", /Contact inbox/.test(adminBody));
log("admin sees new message:", adminBody.includes(`verify-${suffix}@example.com`));
await shot(page, "14-admin-inbox");

// mark message read
const markReadBtn = page.getByRole("button", { name: "mark read" }).first();
await markReadBtn.click();
await page.waitForTimeout(2000);
await shot(page, "15-admin-marked-read");

// ——— 7. Probes: reduced motion fallback + mobile viewport ———
const ctx2 = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const m = await ctx2.newPage();
await m.goto(BASE + "/", { waitUntil: "networkidle" });
await m.waitForTimeout(1500);
const staticBody = await m.textContent("body");
log("reduced-motion static fallback:", /Chaos, everywhere/.test(staticBody));
await m.screenshot({ path: `${OUT}/16-mobile-reduced.png`, fullPage: false });

const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const m2 = await ctx3.newPage();
await m2.goto(BASE + "/", { waitUntil: "networkidle" });
await m2.waitForTimeout(2500);
await m2.screenshot({ path: `${OUT}/17-mobile-gate.png` });

await browser.close();
log("DONE");
