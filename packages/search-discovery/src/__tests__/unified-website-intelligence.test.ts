import assert from "node:assert/strict";
import { crawlWebsite, normalizeCrawlUrl, assertPublicHttpTarget, parseSitemapXml, isPrivateIp } from "../crawler.ts";
import { runWebsiteIntelligencePipeline } from "../../../../lib/intelligence/website-intelligence.ts";

async function testWebsiteIntelligenceSuite() {
  console.log("Running Unified Website Intelligence Suite (Cases 1-16)...");

  // Helper mock resolver (Public IP)
  const mockPublicResolver = async () => [{ address: "104.21.5.10", family: 4 }];

  // 1. Static business website
  const staticHtml = `<!DOCTYPE html><html><head><title>Static Business Hub</title><meta name="description" content="Static site description" /></head><body><h1>Welcome</h1><p>Our company offers consulting.</p><a href="/about">About</a></body></html>`;
  const staticFetcher = async (url: string | URL) => new Response(staticHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const staticResult = await runWebsiteIntelligencePipeline("https://static-business.in", { fetcher: staticFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(staticResult.identity.businessName.value, "Static Business Hub");
  assert.ok(staticResult.seo.indexablePages >= 1);
  console.log("  ✓ Case 1: Static business website passed");

  // 2. React / Next.js website
  const nextHtml = `<!DOCTYPE html><html><head><title>Next.js Modern App</title><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script></head><body><div id="__next"><h1>Next.js Platform</h1></div></body></html>`;
  const nextFetcher = async () => new Response(nextHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const nextResult = await crawlWebsite("https://nextjs-app.in", { fetcher: nextFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(nextResult.structuredPages[0]?.techSignals.isNextJs, true);
  console.log("  ✓ Case 2: React/Next.js website passed");

  // 3. Sitemap website
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://sitemap-site.in/services</loc></url></urlset>`;
  const sitemapFetcher = async (url: string | URL) => {
    const s = String(url);
    if (s.includes("sitemap")) return new Response(sitemapXml, { status: 200, headers: { "Content-Type": "text/xml" } });
    return new Response(staticHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const sitemapResult = await crawlWebsite("https://sitemap-site.in", { fetcher: sitemapFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(sitemapResult.sitemapPresent, true);
  assert.ok(sitemapResult.sitemapUrlsDiscovered >= 1);
  console.log("  ✓ Case 3: Sitemap website passed");

  // 4. Sitemap index
  const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://sitemap-index-site.in/sitemap-sub.xml</loc></sitemap></sitemapindex>`;
  const sitemapSubXml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://sitemap-index-site.in/page-1</loc></url></urlset>`;
  const sitemapIndexFetcher = async (url: string | URL) => {
    const s = String(url);
    if (s.includes("sitemap-sub")) return new Response(sitemapSubXml, { status: 200, headers: { "Content-Type": "text/xml" } });
    if (s.includes("sitemap")) return new Response(sitemapIndexXml, { status: 200, headers: { "Content-Type": "text/xml" } });
    return new Response(staticHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const parsedUrls = await parseSitemapXml(new URL("https://sitemap-index-site.in/sitemap.xml"), sitemapIndexFetcher as any, { resolver: mockPublicResolver as any });
  assert.ok(parsedUrls.includes("https://sitemap-index-site.in/page-1"));
  console.log("  ✓ Case 4: Sitemap index passed");

  // 5. Website without sitemap
  const noSitemapFetcher = async (url: string | URL) => {
    const s = String(url);
    if (s.includes("sitemap")) return new Response("Not Found", { status: 404 });
    return new Response(staticHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const noSitemapResult = await crawlWebsite("https://no-sitemap.in", { fetcher: noSitemapFetcher as any, resolver: mockPublicResolver as any });
  if (noSitemapResult.pages.length === 0) {
    console.error("DEBUG noSitemapResult errors:", noSitemapResult.errors);
  }
  assert.equal(noSitemapResult.sitemapPresent, false);
  assert.ok(noSitemapResult.pages.length >= 1);
  console.log("  ✓ Case 5: Website without sitemap passed");

  // 6. Website with many internal links (Bounded crawl budget)
  const manyLinksHtml = `<html><body>${Array.from({ length: 50 }, (_, i) => `<a href="/page-${i}">Link ${i}</a>`).join("")}</body></html>`;
  const manyLinksFetcher = async () => new Response(manyLinksHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const boundedResult = await crawlWebsite("https://huge-site.in", { limits: { maxPages: 5 }, fetcher: manyLinksFetcher as any, resolver: mockPublicResolver as any });
  assert.ok(boundedResult.pages.length <= 5, "Crawl budget must strictly cap page discovery");
  console.log("  ✓ Case 6: Website with many internal links passed");

  // 7. Slow website (Timeout handling)
  const slowFetcher = async () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response(staticHtml, { status: 200 })), 200));
  const slowResult = await crawlWebsite("https://slow-site.in", { limits: { requestTimeoutMs: 50, totalTimeoutMs: 150 }, fetcher: slowFetcher as any, resolver: mockPublicResolver as any });
  assert.ok(slowResult.errors.length > 0 || slowResult.pages.length === 0, "Slow requests must timeout fail-safe");
  console.log("  ✓ Case 7: Slow website passed");

  // 8. Redirect website
  const redirectFetcher = async (url: string | URL) => {
    const s = String(url);
    if (s === "https://redirect-site.in/") {
      return new Response(null, { status: 301, headers: { Location: "https://redirect-site.in/final" } });
    }
    return new Response(staticHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const redirectResult = await crawlWebsite("https://redirect-site.in", { fetcher: redirectFetcher as any, resolver: mockPublicResolver as any });
  assert.ok(redirectResult.pages.some((p) => p.url.includes("/final")));
  console.log("  ✓ Case 8: Redirect website passed");

  // 9. Broken page
  const brokenFetcher = async (url: string | URL) => {
    const s = String(url);
    if (s.includes("broken")) return new Response("500 Internal Error", { status: 500 });
    return new Response(`<html><body><a href="/broken">Broken</a></body></html>`, { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const brokenResult = await crawlWebsite("https://broken-site.in", { fetcher: brokenFetcher as any, resolver: mockPublicResolver as any });
  assert.ok(brokenResult.pages.length >= 1, "Crawler must not crash on 500 status");
  console.log("  ✓ Case 9: Broken page passed");

  // 10. SSRF / Private IP protection
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.0.0.1"), true);
  assert.equal(isPrivateIp("172.16.0.1"), true);
  assert.equal(isPrivateIp("192.168.1.1"), true);
  assert.equal(isPrivateIp("169.254.169.254"), true);
  assert.equal(isPrivateIp("::1"), true);
  assert.equal(isPrivateIp("104.21.5.10"), false);

  const mockPrivateResolver = async () => [{ address: "192.168.1.1", family: 4 }];
  await assert.rejects(
    () => assertPublicHttpTarget(new URL("https://private-target.in"), mockPrivateResolver as any),
    /CRAWL_PRIVATE_TARGET_BLOCKED/,
  );
  console.log("  ✓ Case 10: SSRF / Private IP protection passed");

  // 11. General store
  const generalStoreHtml = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"GeneralStore","name":"Patel General Store","address":"Station Road, Raipur","openingHours":"Mo-Su 08:00-22:00"}
    </script></head><body><h1>Patel General Store</h1><a href="https://wa.me/919876543210">Order on WhatsApp</a></body></html>
  `;
  const gsFetcher = async () => new Response(generalStoreHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const gsIntell = await runWebsiteIntelligencePipeline("https://patelstore.in", { fetcher: gsFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(gsIntell.identity.businessName.value, "Patel General Store");
  assert.ok(gsIntell.business.businessType.value.includes("General Store"));
  assert.ok(gsIntell.conversion.whatsapp.value?.includes("919876543210"));
  console.log("  ✓ Case 11: General store passed");

  // 12. Local service business
  const localServiceHtml = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"PlumbingService","name":"Apex Plumbing Services","telephone":"+919999888877"}
    </script></head><body><h1>Emergency Plumbing</h1><a href="tel:+919999888877">Call Now</a></body></html>
  `;
  const lsFetcher = async () => new Response(localServiceHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const lsIntell = await runWebsiteIntelligencePipeline("https://apexplumbing.in", { fetcher: lsFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(lsIntell.identity.businessName.value, "Apex Plumbing Services");
  assert.ok(lsIntell.conversion.phone.value?.includes("9999888877"));
  console.log("  ✓ Case 12: Local service business passed");

  // 13. Ecommerce
  const ecommerceHtml = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Organic Green Tea","offers":{"@type":"Offer","price":"499"}}
    </script></head><body><div class="shopify-section"><h1>Shop Organic</h1></div></body></html>
  `;
  const ecomFetcher = async () => new Response(ecommerceHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const ecomIntell = await runWebsiteIntelligencePipeline("https://organicteashop.in", { fetcher: ecomFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(ecomIntell.business.ecommerceAvailable.value, true);
  assert.ok(ecomIntell.business.products.value.includes("Organic Green Tea"));
  console.log("  ✓ Case 13: Ecommerce passed");

  // 14. Restaurant
  const restaurantHtml = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Restaurant","name":"Tandoor Nights","servesCuisine":"North Indian","menu":"https://tandoornights.in/menu"}
    </script></head><body><h1>Tandoor Nights</h1><a href="/menu">View Menu</a></body></html>
  `;
  const restFetcher = async () => new Response(restaurantHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const restIntell = await runWebsiteIntelligencePipeline("https://tandoornights.in", { fetcher: restFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(restIntell.identity.businessName.value, "Tandoor Nights");
  assert.ok(restIntell.business.industry.value.includes("Food"));
  console.log("  ✓ Case 14: Restaurant passed");

  // 15. Clinic
  const clinicHtml = `
    <html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Dentist","name":"Smile Dental Clinic"}
    </script></head><body><h1>Smile Care</h1><a href="https://calendly.com/smileclinic/book">Book Consultation</a></body></html>
  `;
  const clinicFetcher = async () => new Response(clinicHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const clinicIntell = await runWebsiteIntelligencePipeline("https://smileclinic.in", { fetcher: clinicFetcher as any, resolver: mockPublicResolver as any });
  assert.equal(clinicIntell.identity.businessName.value, "Smile Dental Clinic");
  assert.equal(clinicIntell.business.bookingAvailable.value, true);
  console.log("  ✓ Case 15: Clinic passed");

  // 16. Multi-location business
  const multiLocHtml = `
    <html><head><script type="application/ld+json">
    [{"@type":"LocalBusiness","name":"City Mart - Branch 1","address":"Bhilai"},{"@type":"LocalBusiness","name":"City Mart - Branch 2","address":"Durg"}]
    </script></head><body><h1>City Mart Locations</h1></body></html>
  `;
  const multiFetcher = async () => new Response(multiLocHtml, { status: 200, headers: { "Content-Type": "text/html" } });
  const multiIntell = await runWebsiteIntelligencePipeline("https://citymart.in", { fetcher: multiFetcher as any, resolver: mockPublicResolver as any });
  assert.ok(multiIntell.business.locations.value.length >= 2);
  console.log("  ✓ Case 16: Multi-location business passed");

  console.log("All 16 Mandatory Website Intelligence Cases Passed Successfully!");
}

testWebsiteIntelligenceSuite().catch((err) => {
  console.error("Website intelligence test failed:", err);
  process.exit(1);
});
