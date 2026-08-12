// Run with: node --experimental-strip-types lib/rbac/__tests__/public-marketing-pages.test.ts
//
// Regression guard for the public-design-consistency pass (branch
// feat/stratxcel-core-product-experience): /modules, /use-cases, /pricing,
// /contact, /agents, /system, and /social-autopilot moved off the old
// light Navbar/SiteFooter shell and onto PublicHeader/PublicFooter + the
// Core --sx-* token system, and /products + /solutions were added as
// compatibility routes. Asserts against source rather than rendering,
// since PublicHeader is a client component and several of these pages are
// async Server Components reading searchParams — both only resolve inside
// a real Next.js request/build scope.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

const MIGRATED_ROUTES: { dir: string; file: string }[] = [
  { dir: "modules", file: "page.tsx" },
  { dir: "use-cases", file: "page.tsx" },
  { dir: "pricing", file: "page.tsx" },
  { dir: "contact", file: "page.tsx" },
  { dir: "agents", file: "page.tsx" },
  { dir: "system", file: "page.tsx" },
  { dir: "social-autopilot", file: "page.tsx" },
];

function run() {
  // --- 1. Each migrated route now lives at the top level (app/<route>),
  // matching the pattern already used by app/security, app/about,
  // app/how-it-works — not inside app/(marketing) ------------------------
  for (const { dir, file } of MIGRATED_ROUTES) {
    assert.ok(exists("app", dir, file), `app/${dir}/${file} must exist as a top-level Core-token route`);
    assert.equal(
      exists("app", "(marketing)", dir),
      false,
      `app/(marketing)/${dir} must no longer exist — it would route-conflict with the migrated app/${dir} page`
    );

    const source = read("app", dir, file);
    assert.ok(
      /from ["']@\/app\/components\/PublicHeader["']/.test(source),
      `app/${dir}/${file} must render the shared PublicHeader, not the legacy Navbar`
    );
    assert.ok(
      /from ["']@\/app\/components\/PublicFooter["']/.test(source),
      `app/${dir}/${file} must render the shared PublicFooter, not the legacy SiteFooter`
    );
    assert.ok(/<PublicHeader\s*\/>/.test(source), `app/${dir}/${file} must actually mount <PublicHeader />`);
    assert.ok(/<PublicFooter\s*\/>/.test(source), `app/${dir}/${file} must actually mount <PublicFooter />`);
    assert.ok(
      /bg-sx-bg/.test(source),
      `app/${dir}/${file} must sit on the Core canvas token (bg-sx-bg), not the old light marketing background`
    );
    assert.equal(
      /\b(bg|text|border)-slate-\d/.test(source),
      false,
      `app/${dir}/${file} must not use raw slate-* Tailwind utilities from the old light shell — use --sx-* tokens`
    );
    assert.equal(
      /from ["']@\/lib\/constants["'].*\bCOLORS\b|\bCOLORS\.(ink|brand|surface)\b/s.test(source),
      false,
      `app/${dir}/${file} must not depend on the legacy COLORS palette (ink/brand/surface) from lib/constants`
    );
  }

  // --- 2. /contact preserves the intent-query-param -> ContactForm wiring,
  // and now runs the dark tone matching its new Core shell -----------------
  const contactPage = read("app", "contact", "page.tsx");
  assert.ok(
    /searchParams:\s*Promise<\{\s*intent\?:\s*string\s*\}>/.test(contactPage),
    "app/contact/page.tsx must keep awaiting the typed { intent } searchParams"
  );
  assert.ok(
    /<ContactForm\s+source="contact-page"\s+tone="dark"\s+intent=\{intent\}\s*\/>/.test(contactPage),
    "app/contact/page.tsx must pass tone=\"dark\" now that it sits on the dark Core shell (was tone=\"light\" on the old shell)"
  );

  // --- 3. /social-autopilot keeps its full SEO metadata: canonical +
  // openGraph — the richest metadata block of the migrated set -------------
  const socialPage = read("app", "social-autopilot", "page.tsx");
  assert.ok(
    /alternates:\s*\{\s*canonical:\s*canonicalUrl\s*,?\s*\}/.test(socialPage),
    "app/social-autopilot/page.tsx must keep its alternates.canonical metadata"
  );
  assert.ok(
    /canonicalUrl\s*=\s*"https:\/\/www\.stratxcel\.in\/social-autopilot"/.test(socialPage),
    "app/social-autopilot/page.tsx must keep the exact canonical URL"
  );
  assert.ok(/openGraph:\s*\{/.test(socialPage), "app/social-autopilot/page.tsx must keep its openGraph metadata block");

  // --- 4. /modules, /use-cases, /pricing keep their export const metadata
  // (title/description) rather than losing SEO on migration ---------------
  for (const dir of ["modules", "use-cases", "pricing", "agents", "system"]) {
    const source = read("app", dir, "page.tsx");
    assert.ok(/export const metadata:\s*Metadata\s*=\s*\{/.test(source), `app/${dir}/page.tsx must keep export const metadata`);
    assert.ok(/title:/.test(source), `app/${dir}/page.tsx metadata must keep a title`);
  }

  // --- 5. /products and /solutions are real compatibility routes, and
  // /modules + /use-cases keep working unchanged for existing bookmarks ---
  assert.ok(exists("app", "products", "page.tsx"), "app/products/page.tsx must exist as a compatibility route");
  assert.ok(exists("app", "solutions", "page.tsx"), "app/solutions/page.tsx must exist as a compatibility route");
  const productsSource = read("app", "products", "page.tsx");
  const solutionsSource = read("app", "solutions", "page.tsx");
  assert.ok(/redirect\(["']\/modules["']\)/.test(productsSource), "app/products must redirect to /modules");
  assert.ok(/redirect\(["']\/use-cases["']\)/.test(solutionsSource), "app/solutions must redirect to /use-cases");
  assert.ok(exists("app", "modules", "page.tsx"), "/modules must keep working for existing bookmarks");
  assert.ok(exists("app", "use-cases", "page.tsx"), "/use-cases must keep working for existing bookmarks");

  // --- 6. No fabricated proof content introduced by this pass -------------
  assert.equal(exists("app", "results"), false, "app/results must not be created without real sourced proof");
  assert.equal(exists("app", "work"), false, "app/work must not be created without real sourced proof");
  for (const { dir, file } of MIGRATED_ROUTES) {
    const source = read("app", dir, file);
    assert.equal(
      /testimonial|case study|customer logo|Fortune 500|ISO\s*27001|SOC\s*2/i.test(source),
      false,
      `app/${dir}/${file} must not fabricate testimonials, case studies, customer logos, or compliance claims`
    );
  }

  // --- 7. The public header stays usable on light and mobile canvases. The
  // mobile dialog must be a sibling of the backdrop-filter header; a fixed
  // child inside that header is clipped to its containing block on mobile.
  const logoSource = read("app", "components", "Logo.jsx");
  assert.ok(/text-sx-text/.test(logoSource), "Logo wordmark must use the active theme token");
  assert.equal(
    /wordmarkClass[\s\S]{0,200}text-white|wordmarkClass[\s\S]{0,200}text-\[#0B1220\]/.test(logoSource),
    false,
    "Logo wordmark must not hard-code a color that disappears on one public theme"
  );

  const headerSource = read("app", "components", "PublicHeader.tsx");
  assert.ok(/<\/header>\s*\{open && \(/.test(headerSource), "Mobile menu overlay must render outside the sticky header");
  assert.ok(/fixed inset-0 z-\[60\]/.test(headerSource), "Mobile menu overlay must cover the viewport above the header");
  assert.ok(/event\.key !== "Tab"/.test(headerSource), "Mobile menu must trap keyboard focus while open");
  assert.ok(/menuButtonRef\.current\?\.focus\(\)/.test(headerSource), "Mobile menu must restore focus to its trigger");
  assert.ok(/inert=\{open \|\| undefined\}/.test(headerSource), "The covered header must be inert while the mobile dialog is open");

  console.log(
    "public-marketing-pages.test.ts: ALL PASS (7 routes on PublicHeader/PublicFooter + sx-* tokens, old (marketing) duplicates removed, contact intent wiring preserved, social-autopilot SEO metadata intact, /products + /solutions compatibility routes present, no fabricated proof content, public logo and mobile menu guarded)"
  );
}

run();
