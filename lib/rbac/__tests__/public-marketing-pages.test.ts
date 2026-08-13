// Run with: node --experimental-strip-types lib/rbac/__tests__/public-marketing-pages.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");
const exists = (...parts: string[]) => fs.existsSync(path.join(root, ...parts));

const MIGRATED_ROUTES: { dir: string; file: string }[] = [
  { dir: "products", file: "page.tsx" },
  { dir: "solutions", file: "page.tsx" },
  { dir: "integrations", file: "page.tsx" },
  { dir: "pricing", file: "page.tsx" },
  { dir: "contact", file: "page.tsx" },
  { dir: "agents", file: "page.tsx" },
  { dir: "system", file: "page.tsx" },
  { dir: "social-autopilot", file: "page.tsx" },
];

function run() {
  for (const { dir, file } of MIGRATED_ROUTES) {
    assert.ok(exists("app", dir, file), `app/${dir}/${file} must exist as a top-level Core-token route`);
    assert.equal(exists("app", "(marketing)", dir), false, `app/(marketing)/${dir} must no longer exist`);
    const source = read("app", dir, file);
    assert.ok(/from ["']@\/app\/components\/PublicHeader["']/.test(source), `app/${dir}/${file} must render PublicHeader`);
    assert.ok(/from ["']@\/app\/components\/PublicFooter["']/.test(source), `app/${dir}/${file} must render PublicFooter`);
    assert.ok(/<PublicHeader\s*\/>/.test(source), `app/${dir}/${file} must mount <PublicHeader />`);
    assert.ok(/<PublicFooter\s*\/>/.test(source), `app/${dir}/${file} must mount <PublicFooter />`);
    assert.ok(/bg-sx-bg/.test(source), `app/${dir}/${file} must use bg-sx-bg`);
  }

  const contactPage = read("app", "contact", "page.tsx");
  assert.ok(/searchParams:\s*Promise<\{\s*intent\?:\s*string\s*\}>/.test(contactPage));
  assert.ok(/<ContactForm\s+source="contact-page"\s+tone="dark"\s+intent=\{intent\}\s*\/>/.test(contactPage));

  const socialPage = read("app", "social-autopilot", "page.tsx");
  assert.ok(/alternates:\s*\{\s*canonical:\s*canonicalUrl\s*,?\s*\}/.test(socialPage));
  assert.ok(/canonicalUrl\s*=\s*"https:\/\/www\.stratxcel\.in\/social-autopilot"/.test(socialPage));
  assert.ok(/openGraph:\s*\{/.test(socialPage));

  for (const dir of ["products", "solutions", "pricing", "agents", "system"]) {
    const source = read("app", dir, "page.tsx");
    assert.ok(/export const metadata:\s*Metadata\s*=\s*\{/.test(source), `app/${dir}/page.tsx must keep metadata`);
    assert.ok(/title:/.test(source), `app/${dir}/page.tsx metadata must keep a title`);
  }

  const productsSource = read("app", "products", "page.tsx");
  const solutionsSource = read("app", "solutions", "page.tsx");
  const modulesSource = read("app", "modules", "page.tsx");
  const useCasesSource = read("app", "use-cases", "page.tsx");
  assert.equal(/redirect\(["']\/modules["']\)/.test(productsSource), false, "app/products must be canonical");
  assert.ok(/ProductOverview/.test(productsSource), "app/products must render ProductOverview");
  assert.ok(/redirect\(["']\/products["']\)/.test(modulesSource), "app/modules must redirect to /products");
  assert.ok(/SolutionsHero/.test(solutionsSource), "app/solutions must render solutions experience");
  assert.ok(/redirect\(["']\/solutions["']\)/.test(useCasesSource), "app/use-cases must redirect to /solutions");

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

  const logoSource = read("app", "components", "Logo.jsx");
  assert.ok(/text-sx-text/.test(logoSource), "Logo wordmark must use the active theme token");
  assert.equal(
    /wordmarkClass[\s\S]{0,200}text-white|wordmarkClass[\s\S]{0,200}text-\[#0B1220\]/.test(logoSource),
    false,
    "Logo wordmark must not hard-code a color that disappears on one public theme"
  );

  const headerSource = read("app", "components", "PublicHeader.tsx");
  assert.ok(/ProductMegaMenu/.test(headerSource), "PublicHeader must mount ProductMegaMenu");
  assert.ok(/MobileProductsAccordion/.test(headerSource), "PublicHeader must mount MobileProductsAccordion");
  assert.ok(/aria-haspopup="true"/.test(read("app", "components", "public", "product-suite", "ProductMegaMenu.tsx")));
  assert.ok(/href:\s*["']\/solutions["']/.test(headerSource), "PublicHeader must link Solutions to /solutions");
  assert.ok(/inert=\{open \|\| undefined\}/.test(headerSource));
  assert.ok(/event\.key !== "Tab"/.test(headerSource));

  console.log("public-marketing-pages.test.ts: ALL PASS");
}

run();
