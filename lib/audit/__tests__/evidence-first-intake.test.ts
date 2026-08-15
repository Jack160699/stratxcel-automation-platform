import assert from "node:assert/strict";
import { normalizeWebsiteUrl, normalizePlatformInput, extractAllSocialLinksFromHtml } from "../../identity/smart-url.ts";
import { runSmartWebsiteDiscovery, detectBusinessStage, generateCandidateGoals } from "../v1/smart-discovery.ts";
import { selectAdaptiveQuestions, adaptiveAnswersComplete } from "../v1/adaptive-questions.ts";
import { buildBrandBrainContentFromAuditIntake } from "../brand-brain.ts";
import { field } from "../v1/provenance.ts";

async function runEvidenceFirstTests() {
  console.log("Starting Evidence-First Audit Intake test suite...");

  // 1. Intelligent URL Normalization
  const testUrls = [
    { input: "  example.com  ", expected: "https://example.com" },
    { input: "www.example.com", expected: "https://www.example.com" },
    { input: "website: https://company.in/about", expected: "https://company.in/about" },
    { input: "http://mybusiness.org", expected: "http://mybusiness.org" },
    { input: "https://instagram.com/mybrand?igsh=123", platform: "instagram" as const, expectedHandle: "@mybrand" },
    { input: "https://maps.app.goo.gl/abcdef123456", platform: "google_business" as const, isMaps: true },
  ];

  for (const t of testUrls) {
    if (t.platform) {
      const norm = normalizePlatformInput(t.platform, t.input);
      assert.equal(norm.ok, true, `Normalization failed for ${t.input}`);
      if (t.expectedHandle) assert.equal(norm.displayHandle, t.expectedHandle);
    } else {
      const norm = normalizeWebsiteUrl(t.input);
      assert.equal(norm.ok, true, `Website normalization failed for ${t.input}`);
      assert.equal(norm.url, t.expected, `Expected ${t.expected} but got ${norm.url}`);
    }
  }
  console.log("✓ Test 1: Intelligent URL Normalization passed");

  // 2. Deep Website Crawl & Google Business Signal Extraction
  const mockHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>Zenith Dental Clinic | Advanced Orthodontics & Implants</title>
        <meta name="description" content="State-of-the-art dental care, clear aligners, and painless dental implants in Indiranagar, Bengaluru." />
        <meta property="og:site_name" content="Zenith Dental Clinic" />
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "MedicalClinic",
            "name": "Zenith Dental Clinic",
            "telephone": "+91 98765 43210",
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "100ft Road, Indiranagar",
              "addressLocality": "Bengaluru",
              "addressRegion": "Karnataka",
              "postalCode": "560038",
              "addressCountry": "India"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.9",
              "reviewCount": "184"
            }
          }
        </script>
      </head>
      <body>
        <h1>Welcome to Zenith Dental Clinic</h1>
        <h2>Our Services</h2>
        <ul>
          <li>Dental Implants Care</li>
          <li>Invisalign & Clear Aligners Solutions</li>
          <li>Teeth Whitening Treatment</li>
        </ul>
        <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d12345!2d77.64!3d12.97"></iframe>
        <footer>
          <a href="https://instagram.com/zenithdental">Instagram</a>
          <a href="https://facebook.com/zenithdentalclinic">Facebook</a>
          <a href="https://wa.me/919876543210">Chat on WhatsApp</a>
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

  const discoveryResult = await runSmartWebsiteDiscovery("zenithdental.in", {
    fetcher: mockFetcher,
    resolver: mockResolver,
  });

  assert.equal(discoveryResult.isSuccess, true);
  assert.equal(discoveryResult.data.businessName, "Zenith Dental Clinic");
  assert.equal(discoveryResult.data.industry, "Healthcare & Wellness");
  assert.equal(discoveryResult.data.location, "100ft Road, Indiranagar, Bengaluru, Karnataka, India");
  assert.equal(discoveryResult.data.reviews?.rating, 4.9);
  assert.equal(discoveryResult.data.reviews?.count, 184);
  assert.ok(discoveryResult.data.googleBusiness?.isEmbed, "Should detect Google Maps embed");
  assert.ok(discoveryResult.data.socialLinks.some((s) => s.platform === "instagram"));
  assert.ok(discoveryResult.data.socialLinks.some((s) => s.platform === "whatsapp"));
  assert.ok(discoveryResult.data.services.length >= 2, "Should extract services list");
  console.log("✓ Test 2: Deep Website Crawl & Google Business Signal Extraction passed");

  // 3. Provenance Badging & Field Completeness
  assert.equal(discoveryResult.data.confidenceTags.businessName, "VERIFIED_PUBLIC");
  assert.equal(discoveryResult.data.confidenceTags.location, "VERIFIED_PUBLIC");
  assert.equal(discoveryResult.data.confidenceTags.industry, "AI_INFERRED");
  assert.ok(discoveryResult.data.knownFields.includes("businessName"));
  assert.ok(discoveryResult.data.knownFields.includes("services"));
  console.log("✓ Test 3: Provenance Badges and Field Completeness passed");

  // 4. Intelligent Goal Suggestions
  const candidateGoals = generateCandidateGoals("GROWING", discoveryResult.data);
  assert.ok(candidateGoals.length > 0);
  assert.ok(candidateGoals.some((g) => g.id === "lead_generation" && g.isRecommended));
  assert.ok(candidateGoals.some((g) => g.id === "social_conversion" && g.isRecommended));
  console.log("✓ Test 4: Intelligent Goal Suggestions derived correctly");

  // 5. Stage Detection & Deliverable Routing
  const establishedStage = detectBusinessStage({
    isReachable: true,
    businessName: "Zenith Dental",
    hasDescription: true,
    socialCount: 3,
    pageCount: 3,
    hasReviews: true,
    hasPricingOrProducts: true,
  });
  assert.equal(establishedStage, "ESTABLISHED");

  const ideaStage = detectBusinessStage({
    isReachable: false,
    hasDescription: false,
    socialCount: 0,
    pageCount: 0,
    hasReviews: false,
    hasPricingOrProducts: false,
  });
  assert.equal(ideaStage, "IDEA");
  console.log("✓ Test 5: Business Stage Detection passed");

  // 6. Adaptive Missing Questions Selection
  const profileWithData = {
    name: field("Zenith Dental", "VERIFIED_PUBLIC"),
    category: field("Healthcare & Wellness", "AI_INFERRED"),
    location: field("Bengaluru", "VERIFIED_PUBLIC"),
    services: field(["Dental Implants Care", "Invisalign"], "AI_INFERRED"),
    audience: field("Local Bengaluru Residents", "AI_INFERRED"),
    websiteUrl: "https://zenithdental.in",
  };

  const selectedQuestions = selectAdaptiveQuestions(profileWithData);
  // Business name and industry should NOT be in the questions bank because they are known
  assert.ok(!selectedQuestions.some((q) => q.id === "businessName"));
  assert.ok(!selectedQuestions.some((q) => q.id === "industry"));
  assert.ok(selectedQuestions.some((q) => q.id === "primaryGoal"));
  assert.ok(selectedQuestions.some((q) => q.id === "biggestGrowthProblem"));

  const answersMap = {
    primaryGoal: "Generate qualified inbound leads & appointments",
    biggestGrowthProblem: "High patient acquisition cost on Google ads",
  };
  assert.equal(adaptiveAnswersComplete(selectedQuestions, answersMap), true);
  console.log("✓ Test 6: Adaptive Missing Questions Selection passed");

  // 7. Brand Brain SSOT Persistence
  const mockOrder = {
    id: "audit_123",
    business_name: "Zenith Dental Clinic",
    industry: "Healthcare & Wellness",
    website_url: "https://zenithdental.in",
    social_links: ["https://instagram.com/zenithdental", "https://facebook.com/zenithdentalclinic"],
    deep_dive_answers: {
      businessStage: "GROWING",
      businessDescription: "State-of-the-art dental care",
      location: "Bengaluru, Karnataka",
      majorProducts: "Dental Implants\nInvisalign",
      services: ["Dental Implants", "Invisalign"],
      reviews: { rating: 4.9, count: 184 },
      biggestProblem: "Scaling inbound patients",
    },
    goals_answers: {
      primaryGoal: "Generate qualified inbound leads & appointments",
      successDefinition: "20 new dental implant inquiries per week",
    },
  };

  const brandBrainContent = buildBrandBrainContentFromAuditIntake(mockOrder);
  assert.equal(brandBrainContent.business_name, "Zenith Dental Clinic");
  assert.equal(brandBrainContent.business_stage, "GROWING");
  assert.equal(brandBrainContent.growth_priority, "Generate qualified inbound leads & appointments");
  assert.equal(Array.isArray(brandBrainContent.online_profiles) && brandBrainContent.online_profiles.length, 2);
  const reviewsObj = brandBrainContent.reviews as { rating?: number; count?: number } | undefined;
  assert.equal(reviewsObj?.rating, 4.9);
  console.log("✓ Test 7: Brand Brain Single Source of Truth persistence verified");

  console.log("ALL 7 EVIDENCE-FIRST AUDIT INTAKE TESTS PASSED SUCCESSFULLY!");
}

runEvidenceFirstTests().catch((err) => {
  console.error("Evidence-first intake test failed:", err);
  process.exit(1);
});
