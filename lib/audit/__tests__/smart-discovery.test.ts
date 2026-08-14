import assert from "node:assert/strict";
import { runSmartWebsiteDiscovery } from "../v1/smart-discovery.ts";

function run() {
  console.log("Starting Smart Website Discovery test suite...");

  // Mock fetcher returning complete HTML with JSON-LD and social links
  const mockHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>XYZ Consultants | Premium Business Advisory</title>
        <meta name="description" content="Strategic management and scaling advisory for high-growth enterprises in India." />
        <meta property="og:site_name" content="XYZ Consultants" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            "name": "XYZ Consultants",
            "description": "Strategic management and scaling advisory",
            "telephone": "+91-9876543210",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "Bhilai",
              "addressRegion": "Chhattisgarh",
              "addressCountry": "India"
            }
          }
        </script>
      </head>
      <body>
        <h1>Welcome to XYZ Consultants</h1>
        <footer>
          <a href="https://instagram.com/xyzconsultants">Instagram</a>
          <a href="https://facebook.com/xyzconsultants">Facebook</a>
          <a href="https://linkedin.com/company/xyzconsultants">LinkedIn</a>
        </footer>
      </body>
    </html>
  `;

  const mockFetcher = (async () => {
    return new Response(mockHtml, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }) as unknown as typeof fetch;

  const mockResolver = (async () => {
    return [{ address: "93.184.216.34", family: 4 }];
  }) as unknown as typeof import("node:dns/promises").lookup;

  // Test 1: Full Discovery
  void runSmartWebsiteDiscovery("xyzconsultants.in", {
    fetcher: mockFetcher,
    resolver: mockResolver,
    timeoutMs: 5000,
  }).then((result) => {
    assert.equal(result.isSuccess, true);
    assert.equal(result.finalState, "COMPLETE");
    assert.equal(result.data.businessName, "XYZ Consultants");
    assert.equal(result.data.location, "Bhilai, Chhattisgarh, India");
    assert.equal(result.data.socialLinks.length, 3);
    assert.ok(result.events.some((e) => e.state === "VALIDATING"));
    assert.ok(result.events.some((e) => e.state === "FETCHING"));
    assert.ok(result.events.some((e) => e.state === "DISCOVERING"));
    assert.ok(result.events.some((e) => e.state === "COMPLETE"));

    // Test 2: Timeout Handling
    const slowFetcher = ((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    return runSmartWebsiteDiscovery("slowsite.com", {
      fetcher: slowFetcher,
      resolver: mockResolver,
      timeoutMs: 200,
    });
  }).then((timeoutResult) => {
    assert.equal(timeoutResult.isSuccess, false);
    assert.equal(timeoutResult.finalState, "TIMEOUT");
    assert.ok(timeoutResult.error?.includes("timed out"));

    console.log("smart-discovery.test.ts: ALL PASS (explicit state machine, DNS validation, JSON-LD parsing, timeout abort guards)");
  });
}

run();
