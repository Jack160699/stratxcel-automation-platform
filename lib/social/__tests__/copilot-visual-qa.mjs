/**
 * Deterministic visual QA harness for Copilot READY/Focus layout.
 * Uses playwright-core against a static fixture (no auth / no backend).
 *
 * npm run test:social-visual-qa
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outDir = path.join(root, ".tmp", "copilot-visual-qa");
const fixturePath = path.join(outDir, "fixture.html");

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1600x900", width: 1600, height: 900 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
];

const FIXTURE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Copilot visual QA fixture</title>
<style>
:root {
  --saut-bg: #0b0e14;
  --saut-surface-1: #12161f;
  --saut-surface-2: #181e2a;
  --saut-surface-3: #222a38;
  --saut-border: #2a3344;
  --saut-border-strong: #3a4558;
  --saut-text: #eef2f8;
  --saut-text-muted: #a8b3c4;
  --saut-text-subtle: #7d8798;
  --saut-accent: #3aa0ff;
  --saut-accent-muted: rgb(58 160 255 / .16);
  --saut-ai: #4fdce5;
  --saut-accent-on: #041018;
  --saut-radius-sm: 10px;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; overflow: hidden; background: var(--saut-bg); color: var(--saut-text); font-family: ui-sans-serif, system-ui, sans-serif; }
.shell { display: grid; grid-template-columns: 64px 1fr; height: 100dvh; }
.nav { background: var(--saut-surface-1); border-right: 1px solid var(--saut-border); }
.main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.topbar { height: 48px; flex-shrink: 0; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--saut-border); background: var(--saut-surface-1); font-size: 15px; font-weight: 600; }
.workspace { flex: 1; min-height: 0; display: grid; grid-template-columns: 0 0 minmax(0,1fr) 0 0; }
.center { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.edge { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; justify-content: space-between; pointer-events: none; z-index: 5; }
.header { height: 44px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 0 120px 0 44px; border-bottom: 1px solid var(--saut-border); }
.header h1 { margin: 0; flex: 1; font-size: 15px; }
.scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; }
.source { display: flex; align-items: center; gap: 12px; max-width: 520px; min-height: 72px; max-height: 88px; padding: 8px 10px; border: 1px solid var(--saut-border); border-radius: 10px; background: var(--saut-surface-2); margin-bottom: 12px; }
.thumb { width: 84px; height: 56px; border-radius: 6px; background: linear-gradient(135deg,#334,#556); flex-shrink: 0; }
.group { border: 1px solid var(--saut-border-strong); border-radius: 12px; padding: 10px 12px; background: var(--saut-surface-1); }
.group h2 { margin: 4px 0 0; font-size: 20px; }
.group p { margin: 4px 0 0; font-size: 12px; color: var(--saut-text-muted); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.chip { height: 26px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--saut-border-strong); font-size: 11px; display: inline-flex; align-items: center; background: var(--saut-surface-2); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; }
.card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--saut-border); border-radius: 10px; background: var(--saut-surface-2); max-height: 380px; overflow: hidden; min-width: 0; }
.card-media { height: 160px; border-radius: 8px; background: #2a3344; }
.card h3 { margin: 0; font-size: 13px; }
.card .acct { font-size: 14px; font-weight: 600; }
.card .handle { font-size: 11px; color: var(--saut-text-subtle); }
.card .caption { font-size: 13px; color: var(--saut-text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.actions { display: flex; gap: 6px; margin-top: auto; }
.btn { height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--saut-border-strong); background: var(--saut-surface-3); color: var(--saut-text); font-size: 12.5px; }
.btn.primary { background: var(--saut-accent); border-color: var(--saut-accent); color: var(--saut-accent-on); }
.dock { flex-shrink: 0; min-height: 60px; max-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--saut-border); background: rgb(11 14 20 / .94); }
.composer { flex-shrink: 0; padding: 6px 10px 8px; border-top: 1px solid var(--saut-border); }
.composer-row { display: flex; align-items: center; gap: 6px; min-height: 44px; border: 1px solid var(--saut-border-strong); border-radius: 14px; padding: 4px 6px; background: var(--saut-surface-2); }
.composer-row input { flex: 1; border: 0; background: transparent; color: var(--saut-text); font-size: 13.5px; outline: 0; }
.icon { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--saut-border-strong); background: var(--saut-surface-3); }
.edge button, .edge .ready { pointer-events: auto; height: 28px; border-radius: 6px; border: 1px solid var(--saut-border-strong); background: var(--saut-surface-2); color: var(--saut-text-muted); font-size: 12px; padding: 0 10px; }
.edge .cluster { display: flex; gap: 8px; align-items: center; }
.drawer { position: absolute; top: 0; bottom: 0; width: 300px; right: 0; background: var(--saut-surface-1); border-left: 1px solid var(--saut-border-strong); z-index: 21; display: none; padding: 12px; }
.drawer.open { display: block; }
.backdrop { position: absolute; inset: 0; background: rgb(2 7 14 / .35); z-index: 20; display: none; }
.backdrop.open { display: block; }
.modal { position: fixed; inset: 0; display: none; place-items: center; background: rgb(2 7 14 / .78); z-index: 100; padding: 20px; }
.modal.open { display: grid; }
.dialog { width: min(920px, calc(100vw - 48px)); height: min(820px, calc(100dvh - 40px)); max-height: min(820px, calc(100dvh - 40px)); display: flex; flex-direction: column; background: var(--saut-surface-1); border: 1px solid var(--saut-border-strong); border-radius: 16px; overflow: hidden; }
.dialog header, .dialog footer { flex-shrink: 0; height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--saut-border); }
.dialog footer { height: 64px; border-bottom: 0; border-top: 1px solid var(--saut-border); justify-content: flex-end; }
.dialog main { flex: 1; min-height: 0; overflow: auto; padding: 16px; background: #0f131a; display: grid; place-items: center; }
.mock { width: min(560px, 100%); background: #fff; color: #151; border-radius: 12px; overflow: hidden; }
.mock .ph { display: flex; gap: 8px; padding: 12px; align-items: center; }
.mock .av { width: 38px; height: 38px; border-radius: 50%; background: #0a66c2; color: #fff; display: grid; place-items: center; font-weight: 700; }
.mock .media { height: 280px; background: #dde3ea; }
.mock .copy { padding: 0 12px 12px; font-size: 13px; }
</style>
</head>
<body>
<div class="shell" data-state="ready-focus">
  <aside class="nav" aria-label="Global nav"></aside>
  <div class="main">
    <div class="topbar">Social Autopilot</div>
    <div class="workspace">
      <div></div><div></div>
      <section class="center" data-center-scroll-owner="true">
        <div class="edge">
          <button type="button" title="Open conversations">☰</button>
          <div class="cluster">
            <span class="ready">✓ Ready</span>
            <button type="button" id="open-activity" title="Open activity">≡</button>
          </div>
        </div>
        <header class="header"><h1>Image ideas</h1><span>READY</span><button class="btn">Focus</button><button class="btn">New</button></header>
        <div class="scroll" id="scroll">
          <div class="source" data-source-strip="true"><div class="thumb"></div><div><strong>Screenshot.png</strong><div style="font-size:11px;color:var(--saut-text-subtle)">Photo · Ready</div></div><button class="btn">Open</button></div>
          <div class="group">
            <div style="font-size:10px;color:var(--saut-ai);font-weight:600">Ready for review</div>
            <h2>3 posts prepared from 1 image</h2>
            <p>LinkedIn · Instagram · Threads</p>
            <div class="chips"><span class="chip">LinkedIn</span><span class="chip">Instagram</span><span class="chip">Threads</span></div>
            <div class="grid" id="card-grid">
              <article class="card" data-card><h3>LinkedIn</h3><div class="acct">Shriyansh Chandrakar</div><div class="handle">@stratxcel</div><div class="card-media"></div><div class="caption">A clear founder update about the operating system for growth teams with measured outcomes.</div><div style="font-size:11px;color:var(--saut-text-subtle)">6 hashtags</div><div class="actions"><button class="btn">Preview</button><button class="btn">Edit</button></div></article>
              <article class="card" data-card><h3>Instagram</h3><div class="acct">Stratxcel solutions</div><div class="handle">@stratxcel.in</div><div class="card-media"></div><div class="caption">Visual story for the brand with a concise caption.</div><div style="font-size:11px;color:var(--saut-text-subtle)">6 hashtags</div><div class="actions"><button class="btn">Preview</button><button class="btn">Edit</button></div></article>
              <article class="card" data-card><h3>Threads</h3><div class="acct">Stratxcel</div><div class="handle">@stratxcel</div><div class="card-media"></div><div class="caption">Short commentary for the thread audience.</div><div style="font-size:11px;color:var(--saut-text-subtle)">4 hashtags</div><div class="actions"><button class="btn">Preview</button><button class="btn">Edit</button></div></article>
            </div>
          </div>
        </div>
        <div class="dock" data-approval-dock="true"><div><strong>3 selected</strong><div style="font-size:11px;color:var(--saut-text-muted)">LinkedIn · Instagram · Threads</div></div><div><button class="btn">Cancel</button> <button class="btn primary">Approve shadow run (3)</button></div></div>
        <div class="composer"><div class="composer-row"><button class="icon">+</button><input placeholder="Message Copilot…" /><button class="icon">◉</button><button class="icon" style="background:var(--saut-accent);border-color:var(--saut-accent)">↑</button></div></div>
        <div class="backdrop" id="backdrop"></div>
        <aside class="drawer" id="drawer"><strong>Activity</strong><p style="font-size:12px;color:var(--saut-text-muted)">Progress details overlay — card widths unchanged.</p></aside>
      </section>
      <div></div><div></div>
    </div>
  </div>
</div>
<div class="modal" id="modal">
  <div class="dialog" data-preview-dialog="true">
    <header><strong>LinkedIn preview</strong><span style="margin-left:auto;font-size:11px">Fit</span><button class="btn" id="close-modal">×</button></header>
    <main><article class="mock"><div class="ph"><span class="av">S</span><div><strong>Shriyansh Chandrakar</strong><div style="font-size:11px;color:#687">@stratxcel</div></div></div><div class="copy">Founder update excerpt…</div><div class="media"></div></article></main>
    <footer><button class="btn">Back</button><button class="btn">Edit</button><button class="btn primary">Approve shadow run</button></footer>
  </div>
</div>
<script>
const drawer = document.getElementById('drawer');
const backdrop = document.getElementById('backdrop');
document.getElementById('open-activity').onclick = () => { drawer.classList.add('open'); backdrop.classList.add('open'); };
backdrop.onclick = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); };
document.querySelectorAll('[data-card] .btn').forEach((b,i)=>{ if(b.textContent==='Preview' && i===0) b.onclick=()=>document.getElementById('modal').classList.add('open'); });
document.getElementById('close-modal').onclick=()=>document.getElementById('modal').classList.remove('open');
</script>
</body>
</html>`;

async function measure(page) {
  return page.evaluate(() => {
    const body = document.body;
    const center = document.querySelector(".center");
    const dock = document.querySelector("[data-approval-dock]");
    const composer = document.querySelector(".composer");
    const source = document.querySelector("[data-source-strip]");
    const cards = [...document.querySelectorAll("[data-card]")];
    const dialog = document.querySelector("[data-preview-dialog]");
    const modalOpen = document.getElementById("modal")?.classList.contains("open");
    const grid = document.getElementById("card-grid");
    const cardWidths = cards.map((c) => c.getBoundingClientRect().width);
    return {
      bodyOverflowX: body.scrollWidth > body.clientWidth + 1,
      bodyScrollY: document.documentElement.scrollHeight > window.innerHeight + 2 && getComputedStyle(document.documentElement).overflowY !== "hidden",
      centerWidth: center?.getBoundingClientRect().width ?? 0,
      dockInView: (() => {
        const r = dock?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= window.innerHeight + 1;
      })(),
      composerInView: (() => {
        const r = composer?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.bottom <= window.innerHeight + 1;
      })(),
      sourceHeight: source?.getBoundingClientRect().height ?? 0,
      cardMaxHeight: Math.max(0, ...cards.map((c) => c.getBoundingClientRect().height)),
      cardMinWidth: Math.min(...cardWidths),
      cardCount: cards.length,
      columnsApprox: (() => {
        if (!grid || !cards.length) return 0;
        const tops = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)));
        return Math.ceil(cards.length / tops.size);
      })(),
      modalFits: !modalOpen
        ? true
        : (() => {
            const r = dialog?.getBoundingClientRect();
            return !!r && r.top >= 0 && r.bottom <= window.innerHeight + 2 && r.left >= 0 && r.right <= window.innerWidth + 2;
          })(),
      footerVisible: !modalOpen
        ? true
        : (() => {
            const footer = dialog?.querySelector("footer");
            const r = footer?.getBoundingClientRect();
            return !!r && r.bottom <= window.innerHeight + 2;
          })(),
    };
  });
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(fixturePath, FIXTURE, "utf8");

  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    (process.platform === "win32"
      ? "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe"
      : undefined);
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath && fs.existsSync(chromePath) ? chromePath : undefined,
  });
  const defects = [];

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(`file://${fixturePath.replace(/\\/g, "/")}`);

      // READY Focus baseline
      let m = await measure(page);
      await page.screenshot({ path: path.join(outDir, `${vp.name}-ready-focus.png`), fullPage: false });
      if (m.bodyOverflowX) defects.push(`${vp.name}: body horizontal overflow`);
      if (m.centerWidth < vp.width * 0.7) defects.push(`${vp.name}: center too narrow (${Math.round(m.centerWidth)})`);
      if (!m.dockInView) defects.push(`${vp.name}: approval dock not in viewport`);
      if (!m.composerInView) defects.push(`${vp.name}: composer not in viewport`);
      if (m.sourceHeight > 96) defects.push(`${vp.name}: source strip too tall (${Math.round(m.sourceHeight)})`);
      if (m.cardMaxHeight > 400) defects.push(`${vp.name}: card too tall (${Math.round(m.cardMaxHeight)})`);
      if (m.cardMinWidth < 280 && vp.width >= 1280) defects.push(`${vp.name}: card squeezed (${Math.round(m.cardMinWidth)})`);

      const widthsBefore = await page.evaluate(() => [...document.querySelectorAll("[data-card]")].map((c) => Math.round(c.getBoundingClientRect().width)));
      await page.click("#open-activity");
      await page.screenshot({ path: path.join(outDir, `${vp.name}-activity-drawer.png`), fullPage: false });
      const widthsAfter = await page.evaluate(() => [...document.querySelectorAll("[data-card]")].map((c) => Math.round(c.getBoundingClientRect().width)));
      if (JSON.stringify(widthsBefore) !== JSON.stringify(widthsAfter)) {
        defects.push(`${vp.name}: drawer open changed card widths ${JSON.stringify(widthsBefore)} → ${JSON.stringify(widthsAfter)}`);
      }
      await page.click("#backdrop");

      await page.click("text=Preview");
      m = await measure(page);
      await page.screenshot({ path: path.join(outDir, `${vp.name}-preview-fit.png`), fullPage: false });
      if (!m.modalFits) defects.push(`${vp.name}: preview modal exceeds viewport`);
      if (!m.footerVisible) defects.push(`${vp.name}: preview footer not visible`);
      await page.click("#close-modal");
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const report = { outDir, defects, viewports: VIEWPORTS.map((v) => v.name) };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  assert.equal(defects.length, 0, `Visual QA defects:\\n${defects.join("\\n")}`);
  console.log(`copilot-visual-qa: ALL PASS (${VIEWPORTS.length} viewports) → ${outDir}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
