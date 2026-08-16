import assert from "node:assert/strict";
import { runSmartWebsiteDiscovery } from "../lib/audit/v1/smart-discovery.ts";

async function testDiscovery() {
  console.log("Running self-discovery test against Stratxcel HTML signals...");

  // Mock public HTML representing https://www.stratxcel.in
  const mockHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Stratxcel — practical growth operations for small businesses</title>
        <meta name="description" content="Start with an evidence-backed AI Business Growth Audit, then activate the growth workflows that fit your business." />
        <meta property="og:site_name" content="Stratxcel" />
        <link rel="canonical" href="https://www.stratxcel.in" />
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "Stratxcel",
          "url": "https://www.stratxcel.in",
          "email": "contact@stratxcel.in",
          "telephone": "+91-77778-12777",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Bhilai",
            "addressRegion": "Chhattisgarh",
            "addressCountry": "IN"
          },
          "sameAs": [
            "https://www.instagram.com/stratxcel.ai/",
            "https://www.threads.net/@stratxcel.ai",
            "https://www.facebook.com/share/1ZfjUR2RTS/",
            "https://www.youtube.com/@StratxcelSolutions",
            "https://www.linkedin.com/company/107894380/",
            "https://wa.me/917777812777"
          ]
        }
        </script>
      </head>
      <body>
        <h1>Stratxcel Growth Operations</h1>
        <p>AI Business Growth Audit, Social Media Autopilot, WhatsApp Automation, and CRM</p>
        <h2>Our Services</h2>
        <ul>
          <li>Social Autopilot Management</li>
          <li>WhatsApp Lead Automation</li>
          <li>Search & Discovery Optimization</li>
        </ul>
        <footer>
          <a href="https://www.instagram.com/stratxcel.ai/">Instagram</a>
          <a href="https://www.facebook.com/share/1ZfjUR2RTS/">Facebook</a>
          <a href="https://www.threads.net/@stratxcel.ai">Threads</a>
          <a href="https://www.youtube.com/@StratxcelSolutions">YouTube</a>
          <a href="https://wa.me/917777812777">WhatsApp</a>
          <a href="https://www.linkedin.com/company/107894380/">LinkedIn</a>
          <a href="mailto:contact@stratxcel.in">contact@stratxcel.in</a>
        </footer>
      </body>
    </html>
  `;

  const mockFetcher = async () => new Response(mockHtml, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

  const mockResolver = async () => [{ address: "104.21.5.10", family: 4 }];

  const result = await runSmartWebsiteDiscovery("https://www.stratxcel.in", {
    fetcher: mockFetcher as any,
    resolver: mockResolver as any,
  });

  console.log("Self-discovery result state:", result.finalState);
  console.log("Discovered business name:", result.data.businessName);
  console.log("Discovered industry:", result.data.industry);
  console.log("Discovered business model:", result.data.businessModel);
  console.log("Discovered location:", result.data.location);
  console.log("Discovered phone:", result.data.phone);
  console.log("Discovered email:", result.data.email);
  console.log("Discovered socials count:", result.data.socialLinks.length);
  console.log("Discovered stage:", result.data.businessStage);
  console.log("Discovered recommended package:", result.data.recommendedPackage);

  assert.equal(result.isSuccess, true, "Discovery must complete successfully");
  assert.equal(result.data.businessName, "Stratxcel");
  assert.equal(result.data.location, "Bhilai, Chhattisgarh, IN");
  assert.equal(result.data.phone, "+91-77778-12777");
  assert.equal(result.data.email, "contact@stratxcel.in");
  assert.ok(result.data.socialLinks.length >= 5, "Must discover at least 5 public channels");
  assert.ok(result.data.recommendedGoals.length > 0, "Must recommend contextual goals");

  console.log("self-discovery.test.ts: ALL PASS");
}

testDiscovery().catch((err) => {
  console.error("Discovery test failed:", err);
  process.exit(1);
});
