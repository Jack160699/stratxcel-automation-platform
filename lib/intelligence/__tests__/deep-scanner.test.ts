import assert from "node:assert/strict";
import { runDeepWebsiteIntelligence } from "../deep-scanner.ts";

async function testDeepScanner() {
  console.log("Running Deep Website Intelligence Multi-Agent Scanner test...");

  const mockHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Stratxcel — AI Operations for Small Business</title>
        <meta name="description" content="AI business growth platform, WhatsApp automation, and social autopilot." />
        <meta property="og:site_name" content="Stratxcel" />
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Stratxcel",
          "url": "https://www.stratxcel.in",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Bhilai",
            "addressRegion": "Chhattisgarh",
            "addressCountry": "IN"
          }
        }
        </script>
      </head>
      <body>
        <h1>Stratxcel Platform</h1>
        <p>Providing automated lead generation and conversion solutions.</p>
        <h2>Our Services</h2>
        <ul>
          <li>Social Media Automation</li>
          <li>WhatsApp Business Integration</li>
          <li>Local SEO Optimization</li>
        </ul>
        <div class="pricing">Plans starting from ₹999 /mo</div>
        <div class="reviews">Rated 4.9/5 stars by 250+ verified businesses</div>
        <footer>
          <a href="https://instagram.com/stratxcel">Instagram</a>
          <a href="https://wa.me/917777812777">WhatsApp Support</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </footer>
      </body>
    </html>
  `;

  const mockFetcher = async (url: string | URL) => {
    return new Response(mockHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };

  const mockResolver = async () => [{ address: "104.21.5.10", family: 4 }];

  const result = await runDeepWebsiteIntelligence("https://www.stratxcel.in", {
    fetcher: mockFetcher as any,
    resolver: mockResolver as any,
    maxPages: 3,
  });

  // Verify Identity Agent
  assert.equal(result.identity.businessName.value, "Stratxcel");
  assert.equal(result.identity.businessName.provenance, "VERIFIED_PUBLIC");
  assert.ok(result.identity.description?.value.includes("AI business growth platform"));

  // Verify Business Agent
  assert.equal(result.business.industry.value, "SaaS & Technology");
  assert.equal(result.business.businessModel.value, "B2B Subscription");
  assert.ok(result.business.operatingLocations.value.includes("Bhilai, Chhattisgarh, IN"));
  assert.ok(result.business.services.value.length >= 2);

  // Verify Social Agent
  assert.ok(result.social.channels.some((c) => c.platform === "instagram" && c.handle.includes("stratxcel")));
  assert.ok(result.social.channels.some((c) => c.platform === "whatsapp"));

  // Verify Trust Agent
  assert.equal(result.trust.hasReviews, true);
  assert.equal(result.trust.rating, 4.9);
  assert.equal(result.trust.reviewCount, 250);

  // Verify Conversion Agent
  assert.equal(result.conversion.hasWhatsapp, true);

  console.log("deep-scanner.test.ts: ALL PASS");
}

testDeepScanner().catch((err) => {
  console.error("Deep scanner test failed:", err);
  process.exit(1);
});
