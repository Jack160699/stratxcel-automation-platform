/**
 * Website Intelligence Engine Test Suite
 *
 * Verifies:
 * 1. HTML parsing, content extraction, and semantic section discovery
 * 2. SSRF & private IP / localhost / metadata blocking security controls
 * 3. Design system extraction (colors, typography, spacing, layout)
 * 4. E-commerce detection & catalog signals
 * 5. Repository / codebase analyzer with strict secret redaction
 * 6. End-to-end analyzeWebsite output schema validation
 */

import { strict as assert } from "node:assert";
import { isSafeTargetUrl, validateRedirectTarget } from "../intelligence/security.ts";
import { parseHtml } from "../intelligence/parser.ts";
import { analyzeDesignSystem } from "../intelligence/design.ts";
import { analyzeEcommerce } from "../intelligence/ecommerce.ts";
import { analyzeRepository, redactSecrets } from "../intelligence/repo-reader.ts";
import { analyzeWebsite } from "../intelligence/analyzer.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          passed++;
          console.log(`  ✓ ${name}`);
        })
        .catch((err) => {
          failed++;
          console.error(`  ✗ ${name}: ${err.message}`);
        });
    }
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: unknown) {
    failed++;
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

async function runIntelligenceSuite() {
  console.log("\n==================================================");
  console.log("WEBSITE INTELLIGENCE ENGINE TEST SUITE");
  console.log("==================================================\n");

  // 1. SSRF & Security Protection
  console.log("--- 1. SSRF & Security Controls ---");

  test("Allows valid public HTTPS URLs", () => {
    assert.equal(isSafeTargetUrl("https://example.com").safe, true);
    assert.equal(isSafeTargetUrl("https://my-brand.store/products").safe, true);
  });

  test("Blocks localhost and loopback IPv4/IPv6", () => {
    assert.equal(isSafeTargetUrl("http://localhost:3000").safe, false);
    assert.equal(isSafeTargetUrl("http://127.0.0.1:8080").safe, false);
    assert.equal(isSafeTargetUrl("http://127.0.1.1").safe, false);
    assert.equal(isSafeTargetUrl("http://[::1]").safe, false);
  });

  test("Blocks private RFC 1918 networks", () => {
    assert.equal(isSafeTargetUrl("http://10.0.0.1/admin").safe, false);
    assert.equal(isSafeTargetUrl("http://192.168.1.1").safe, false);
    assert.equal(isSafeTargetUrl("http://172.20.0.5").safe, false);
  });

  test("Blocks cloud metadata endpoints (169.254.169.254)", () => {
    assert.equal(isSafeTargetUrl("http://169.254.169.254/latest/meta-data/").safe, false);
    assert.equal(isSafeTargetUrl("http://metadata.google.internal/computeMetadata/v1/").safe, false);
  });

  test("Blocks userinfo in URL and malformed URLs", () => {
    assert.equal(isSafeTargetUrl("https://admin:password@example.com").safe, false);
    assert.equal(isSafeTargetUrl("not-a-valid-url").safe, false);
    assert.equal(isSafeTargetUrl("ftp://example.com").safe, false);
  });

  test("Redirect validation blocks malicious redirect to private network", () => {
    const current = "https://example.com";
    const safeRedirect = validateRedirectTarget(current, "/about");
    assert.equal(safeRedirect.safe, true);

    const maliciousRedirect = validateRedirectTarget(current, "http://169.254.169.254/secret");
    assert.equal(maliciousRedirect.safe, false);
  });

  // 2. HTML Semantic Parsing
  console.log("\n--- 2. HTML Semantic Parsing & Structure ---");

  const sampleHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Luxe Apparel | Premium Men's Clothing</title>
        <meta name="description" content="Discover luxury bespoke shirts and trousers designed in Milan.">
        <link rel="canonical" href="https://luxeapparel.com">
        <meta property="og:title" content="Luxe Apparel">
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display&family=Inter" rel="stylesheet">
      </head>
      <body>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/catalog">Catalog</a>
            <a href="/about">Our Story</a>
            <a href="/contact">Contact</a>
          </nav>
        </header>
        <main>
          <section class="hero-banner" style="background-color: #0F172A; color: #FFFFFF;">
            <h1>Bespoke Luxury Menswear</h1>
            <p>Tailored perfection for the modern gentleman.</p>
            <a href="/catalog" class="btn btn-primary" style="background-color: #2563EB;">Shop Collection</a>
          </section>
          <section id="features" style="padding: 24px;">
            <h2>Italian Fabrics</h2>
            <p>Finest organic Egyptian cotton and Merino wool.</p>
          </section>
          <section class="reviews">
            <h2>What Our Clients Say</h2>
            <p>"Best shirts I have ever worn." - Alexander M.</p>
          </section>
          <form id="newsletter-form" action="/subscribe" method="POST">
            <input type="email" name="email" placeholder="Your email address">
            <button type="submit">Join Exclusive Club</button>
          </form>
        </main>
        <footer>
          <p>© 2026 Luxe Apparel. All rights reserved.</p>
        </footer>
      </body>
    </html>
  `;

  test("Parses title, meta description, and canonical URL accurately", () => {
    const parsed = parseHtml(sampleHtml, "https://luxeapparel.com");
    assert.equal(parsed.title, "Luxe Apparel | Premium Men's Clothing");
    assert.equal(parsed.metaDescription, "Discover luxury bespoke shirts and trousers designed in Milan.");
    assert.equal(parsed.canonicalUrl, "https://luxeapparel.com");
    assert.equal(parsed.headings.length >= 3, true);
    assert.equal(parsed.headings[0].text, "Bespoke Luxury Menswear");
  });

  test("Extracts navigation links with clean paths", () => {
    const parsed = parseHtml(sampleHtml, "https://luxeapparel.com");
    assert.equal(parsed.navigation.length, 4);
    assert.equal(parsed.navigation[0].label, "Home");
    assert.equal(parsed.navigation[1].label, "Catalog");
  });

  test("Extracts semantic sections (hero, features, testimonials, footer)", () => {
    const parsed = parseHtml(sampleHtml, "https://luxeapparel.com");
    assert.ok(parsed.sections.some((s) => s.type === "hero"));
    assert.ok(parsed.sections.some((s) => s.type === "features"));
    assert.ok(parsed.sections.some((s) => s.type === "testimonials"));
    assert.ok(parsed.sections.some((s) => s.type === "footer"));
  });

  test("Extracts forms and actionable CTAs", () => {
    const parsed = parseHtml(sampleHtml, "https://luxeapparel.com");
    assert.equal(parsed.forms.length, 1);
    assert.equal(parsed.forms[0].submitLabel, "Join Exclusive Club");
    assert.ok(parsed.forms[0].fieldNames.includes("email"));
  });

  // 3. Design System Extraction
  console.log("\n--- 3. Design System & Styling Analysis ---");

  test("Extracts dominant colors, primary brand color, and background", () => {
    const design = analyzeDesignSystem(sampleHtml);
    assert.equal(design.colorSystem.dominant, "#0F172A");
    assert.equal(design.colorSystem.primary, "#0F172A");
    assert.ok(design.colorSystem.palette.includes("#2563EB"));
  });

  test("Detects Google font families from link tags", () => {
    const design = analyzeDesignSystem(sampleHtml);
    assert.ok(design.typography.primaryFont.includes("Playfair Display") || design.typography.headingsFont?.includes("Playfair Display"));
  });

  // 4. E-Commerce Detection
  console.log("\n--- 4. E-Commerce Intelligence ---");

  const ecommerceHtml = `
    <div class="shopify-section product-card">
      <h3>Italian Silk Tie</h3>
      <span class="price">₹2,499.00</span>
      <button class="add-to-cart-button">Add to Cart</button>
      <a href="/checkout" class="btn">Proceed to Checkout</a>
    </div>
  `;

  test("Detects e-commerce signals, currency INR, cart, and checkout", () => {
    const ecom = analyzeEcommerce(ecommerceHtml);
    assert.equal(ecom.isEcommerce, true);
    assert.equal(ecom.currency, "INR");
    assert.equal(ecom.cartDetected, true);
    assert.equal(ecom.checkoutDetected, true);
    assert.equal(ecom.productCountEstimate >= 1, true);
  });

  // 5. Repository Analysis & Secret Redaction
  console.log("\n--- 5. Repository Analysis & Secret Redaction ---");

  test("Redacts sensitive API keys and tokens", () => {
    const secretContent = `
      password: "dummy_db_password_12345"
      api_key = "dummy_private_api_key_test"
    `;
    const redacted = redactSecrets(secretContent);
    assert.ok(!redacted.includes("dummy_db_password"));
    assert.ok(!redacted.includes("dummy_private_api_key"));
    assert.ok(redacted.includes("[REDACTED_SECRET]"));
  });

  test("Analyzes Next.js codebase files and discovers routes and components", () => {
    const repoInput = {
      repoName: "Stratxcel-Store",
      files: {
        "package.json": JSON.stringify({
          name: "stratxcel-store",
          dependencies: { next: "15.0.0", react: "19.0.0", tailwindcss: "^3.4.0" },
        }),
        "app/page.tsx": "export default function Home() { return <h1>Home</h1> }",
        "app/catalog/page.tsx": "export default function Catalog() { return <h1>Catalog</h1> }",
        "components/Navbar.tsx": "export function Navbar() { return <nav></nav> }",
        "components/HeroButton.tsx": "export function HeroButton() { return <button></button> }",
      },
    };

    const understanding = analyzeRepository(repoInput);
    assert.equal(understanding.sourceType, "repository");
    assert.equal(understanding.pages.length, 2);
    assert.equal(understanding.components.length, 2);
    assert.ok(understanding.technicalSummary.includes("Next.js (React)"));
  });

  // 6. Master analyzeWebsite Integration
  console.log("\n--- 6. Master analyzeWebsite Integration ---");

  test("analyzeWebsite produces complete validated WebsiteUnderstanding object from raw HTML", async () => {
    const res = await analyzeWebsite({
      rawHtml: sampleHtml,
      url: "https://luxeapparel.com",
    });

    assert.equal(res.sourceType, "raw_html");
    assert.equal(res.title, "Luxe Apparel | Premium Men's Clothing");
    assert.equal(res.businessName, "Luxe Apparel");
    assert.ok(res.sections.length > 0);
    assert.ok(res.colorSystem.primary);
    assert.ok(res.typography.primaryFont);
    assert.ok(res.analyzedAt);
  });

  console.log("\n==================================================");
  console.log(`INTELLIGENCE SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) process.exit(1);
}

runIntelligenceSuite();
