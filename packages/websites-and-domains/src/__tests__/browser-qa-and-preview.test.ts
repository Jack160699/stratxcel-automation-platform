/**
 * Automated Browser QA Engine & Preview URL Test Suite
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  previewManager,
  browserQARunner,
  publishGateValidator,
  autoFixEngine,
} from "../index.ts";

describe("Preview URL System & Automated Browser QA Engine", () => {
  const tenantId = "tenant_qa_delhi_101";
  const projectId = "proj_qa_site_202";

  const sample5PageSite = {
    name: "Obsidian Roasters Coffee",
    pages: [
      {
        id: "p_home",
        title: "Home",
        slug: "",
        sections: [
          {
            type: "hero",
            heading: "Obsidian Roasters — Artisanal Single-Origin Coffee",
            subheading: "Roasted fresh weekly in small batches.",
            ctaText: "Shop Beans",
            ctaLink: "/shop",
          },
          {
            type: "products",
            heading: "Signature Roasts",
            products: [
              { name: "Obsidian Reserve Espresso Blend", priceCents: 145000 },
              { name: "Ethiopian Yirgacheffe", priceCents: 165000 },
            ],
            images: [
              { url: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e", altText: "Espresso Beans" },
            ],
          },
        ],
      },
      {
        id: "p_shop",
        title: "Shop",
        slug: "shop",
        sections: [
          {
            type: "products",
            heading: "All Coffee Beans",
            products: [{ name: "Obsidian Reserve", priceCents: 145000 }],
            images: [{ url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd", altText: "Coffee Cup" }],
          },
        ],
      },
      {
        id: "p_story",
        title: "Our Story",
        slug: "story",
        sections: [
          {
            type: "hero",
            heading: "Crafted with Passion Since 2018",
            subheading: "Direct trade beans sourced ethically.",
          },
        ],
      },
      {
        id: "p_brew",
        title: "Brew Guide",
        slug: "brew-guide",
        sections: [
          {
            type: "hero",
            heading: "Master the Perfect Pour-Over",
            subheading: "Step-by-step ratios and water temperature.",
          },
        ],
      },
      {
        id: "p_contact",
        title: "Contact",
        slug: "contact",
        sections: [
          {
            type: "contact",
            heading: "Get in Touch",
            subheading: "Visit our roastery or wholesale inquiries.",
          },
        ],
      },
    ],
  };

  // 1. PREVIEW URL GENERATION & SIGNING
  it("1. Generates and verifies HMAC-SHA256 signed preview URL", () => {
    const token = previewManager.generateSignedToken({
      projectId,
      tenantId,
      version: 1,
      ttlSeconds: 3600,
    });

    assert.ok(token.includes("."));

    const verifyResult = previewManager.verifySignedToken(token);
    assert.equal(verifyResult.allowed, true);
    assert.equal(verifyResult.projectId, projectId);
    assert.equal(verifyResult.tenantId, tenantId);
    assert.equal(verifyResult.version, 1);

    const fullUrl = previewManager.getPreviewUrl({
      projectId,
      tenantId,
      version: 1,
      signed: true,
    });
    assert.ok(fullUrl.includes("https://preview.stratxcel.in/project/proj_qa_site_202?version=1&token="));
  });

  it("2. Rejects tampered and expired preview tokens", () => {
    const validToken = previewManager.generateSignedToken({
      projectId,
      tenantId,
      version: 1,
      ttlSeconds: 3600,
    });

    // Tampered signature
    const tamperedToken = `${validToken.split(".")[0]}.fake_signature_abc`;
    const tamperedResult = previewManager.verifySignedToken(tamperedToken);
    assert.equal(tamperedResult.allowed, false);
    assert.equal(tamperedResult.error, "Invalid token signature");

    // Expired token
    const expiredToken = previewManager.generateSignedToken({
      projectId,
      tenantId,
      version: 1,
      ttlSeconds: -10, // Expired in past
    });
    const expiredResult = previewManager.verifySignedToken(expiredToken);
    assert.equal(expiredResult.allowed, false);
    assert.equal(expiredResult.isExpired, true);
  });

  it("3. Enforces strict noindex, nofollow search engine headers on preview", () => {
    const headers = previewManager.getPreviewHeaders();
    assert.equal(headers["X-Robots-Tag"], "noindex, nofollow, noarchive, nosnippet");
    assert.ok(headers["Cache-Control"].includes("no-cache"));
  });

  // 2. AUTOMATED BROWSER QA ENGINE
  it("4. Executes comprehensive Browser QA across all 8 dimensions (Passes Clean Site)", async () => {
    const qaResult = await browserQARunner.runFullBrowserQA({
      projectId,
      tenantId,
      version: 1,
      previewUrl: `https://preview.stratxcel.in/project/${projectId}?version=1`,
      siteModel: sample5PageSite,
      hasEcommerce: true,
      hasAiAgent: true,
    });

    assert.equal(qaResult.status, "PASSED");
    assert.ok(qaResult.score >= 95);
    assert.equal(qaResult.criticalFailures.length, 0);
    assert.ok(qaResult.checks.length >= 10);
    assert.equal(qaResult.customerFacingSummary.state, "good");
    assert.equal(qaResult.customerFacingSummary.canPublish, true);

    // Responsive checks verified at 4 viewports
    const respChecks = qaResult.checks.filter((c) => c.category === "RESPONSIVE_VIEWPORT");
    assert.equal(respChecks.length, 4);
    assert.ok(respChecks.every((c) => c.status === "PASSED"));

    // E-commerce & AI Agent checks verified
    const ecomChecks = qaResult.checks.filter((c) => c.category === "ECOMMERCE");
    assert.ok(ecomChecks.length >= 2);
    assert.ok(ecomChecks.every((c) => c.status === "PASSED"));

    const agentChecks = qaResult.checks.filter((c) => c.category === "AI_AGENT");
    assert.ok(agentChecks.length >= 2);
    assert.ok(agentChecks.every((c) => c.status === "PASSED"));
  });

  it("5. Detects warning on missing image alt text and flags as autoFixable", async () => {
    const flawedSite = {
      name: "Obsidian Roasters",
      pages: [
        {
          id: "p1",
          title: "Home",
          slug: "",
          sections: [
            {
              type: "hero",
              heading: "Obsidian Roasters",
              ctaText: "Explore",
              ctaLink: "/shop",
              images: [{ url: "https://images.unsplash.com/photo-1", altText: "" }], // Missing alt text
            },
          ],
        },
      ],
    };

    const qaResult = await browserQARunner.runFullBrowserQA({
      projectId,
      tenantId,
      version: 1,
      previewUrl: `https://preview.stratxcel.in/project/${projectId}?version=1`,
      siteModel: flawedSite,
    });

    assert.equal(qaResult.status, "WARNING");
    assert.ok(qaResult.warnings.length > 0);
    assert.equal(qaResult.customerFacingSummary.canAutoFix, true);

    const assetCheck = qaResult.checks.find((c) => c.category === "ASSETS");
    assert.equal(assetCheck?.status, "WARNING");
    assert.equal(assetCheck?.autoFixable, true);
  });

  // 3. AUTO-FIX LOOP
  it("6. Auto-Fix Loop repairs QA issues creating version v2 with bounded iterations", async () => {
    // Initialize version v1 in editing engine
    const { websiteVersionManager } = await import("../editing/version-manager.ts");
    websiteVersionManager.registerInitialVersion({
      tenantId,
      projectId,
      specification: {
        version: "1.0",
        websiteType: "BUSINESS_WEBSITE",
        brand: {
          businessName: "Obsidian Roasters",
          tagline: "Artisanal Single-Origin Coffee",
          industry: "Food & Beverage",
          businessType: "Coffee Roastery",
          targetAudience: "Coffee connoisseurs",
          brandPersonality: ["Refined", "Artisanal"],
          uniqueSellingPoints: ["Fresh roasted weekly"],
        },
        visualStyle: {
          aesthetic: "luxury",
          colorPalette: {
            primary: "#111111",
            secondary: "#222222",
            accent: "#c29b38",
            background: "#090d16",
            surface: "#141926",
            text: "#f8fafc",
            textMuted: "#94a3b8",
          },
          typography: {
            headingFont: "Cinzel",
            bodyFont: "Inter",
            style: "editorial",
          },
          spacing: "comfortable",
          borderRadius: "rounded",
          imageStyle: "editorial",
        },
        pages: [],
        navigation: [
          { label: "Home", slug: "/" },
          { label: "Shop", slug: "/shop" },
        ],
        ecommerce: { enabled: false, currency: "INR" },
        agent: { enabled: false },
        seo: {
          generateSitemap: true,
          generateRobotsTxt: true,
          enableOpenGraph: true,
          enableTwitterCards: true,
        },
        contact: {
          showContactForm: true,
          showMap: false,
        },
        domain: { requested: "obsidian.stratxcel.test" },
        generatedAt: new Date().toISOString(),
      },
      siteProject: {
        id: projectId,
        tenantId,
        name: "Obsidian Roasters",
        slug: "obsidian-roasters",
        templateId: "tpl_editorial",
        status: "draft",
        previewSubdomain: "obsidian-preview",
        pages: sample5PageSite.pages.map((p) => ({
          ...p,
          seo: { title: p.title, metaDescription: p.title },
        })) as any,
        revisionCount: 0,
        exportUnlocked: true,
      },
    });

    const flawedSite = {
      name: "Obsidian Roasters",
      pages: [
        {
          id: "p1",
          title: "Home",
          slug: "",
          sections: [
            {
              type: "hero",
              heading: "Obsidian Roasters",
              ctaText: "Explore", // Missing ctaLink
              images: [{ url: "https://images.unsplash.com/photo-1", altText: "" }], // Missing alt
            },
          ],
        },
      ],
    };

    const initialQa = await browserQARunner.runFullBrowserQA({
      projectId,
      tenantId,
      version: 1,
      previewUrl: `https://preview.stratxcel.in/project/${projectId}?version=1`,
      siteModel: flawedSite,
    });

    const fixResult = await autoFixEngine.autoRepairAndVerify(initialQa, {
      projectId,
      tenantId,
      version: 1,
      previewUrl: `https://preview.stratxcel.in/project/${projectId}?version=1`,
      siteModel: sample5PageSite, // Repaired site model
    });

    assert.equal(fixResult.success, true);
    assert.ok(fixResult.attemptCount >= 1 && fixResult.attemptCount <= 2);
    assert.equal(fixResult.repairedVersion, 2);
    assert.equal(fixResult.finalQaResult.status, "PASSED");
  });

  // 4. PRODUCTION PUBLISH GATE
  it("7. Publish Gate strictly blocks publishing on QA failure, unapproved customer, or version mismatch", () => {
    const mockPassedQa = {
      status: "PASSED" as const,
      score: 98,
      totalChecks: 12,
      passedChecks: 12,
      failedChecks: 0,
      criticalFailures: [],
      warnings: [],
      checks: [],
      durationMs: 45,
      runId: "run_1",
      projectId,
      tenantId,
      version: 1,
      previewUrl: "https://preview.stratxcel.in/project/proj_qa_site_202?version=1",
      runAt: new Date().toISOString(),
      customerFacingSummary: {
        state: "good" as const,
        title: "All passed",
        description: "Ready",
        canPublish: true,
        canAutoFix: false,
      },
    };

    // Case A: Customer not approved -> Blocked
    const evalA = publishGateValidator.evaluatePublishReadiness({
      tenantId,
      projectId,
      targetVersion: 1,
      qaResult: mockPassedQa,
      customerApproved: false,
      paymentConfirmed: true,
    });
    assert.equal(evalA.canPublish, false);
    assert.ok(evalA.blockingReasons.some((r) => r.toLowerCase().includes("customer approval")));

    // Case B: Payment not confirmed -> Blocked
    const evalB = publishGateValidator.evaluatePublishReadiness({
      tenantId,
      projectId,
      targetVersion: 1,
      qaResult: mockPassedQa,
      customerApproved: true,
      paymentConfirmed: false,
    });
    assert.equal(evalB.canPublish, false);
    assert.ok(evalB.blockingReasons.some((r) => r.includes("payment confirmation")));

    // Case C: Version mismatch (QA run on v1, target is v2) -> Blocked
    const evalC = publishGateValidator.evaluatePublishReadiness({
      tenantId,
      projectId,
      targetVersion: 2,
      qaResult: mockPassedQa,
      customerApproved: true,
      paymentConfirmed: true,
    });
    assert.equal(evalC.canPublish, false);
    assert.ok(evalC.blockingReasons.some((r) => r.includes("Version mismatch")));

    // Case D: All conditions met -> Allowed
    const evalD = publishGateValidator.evaluatePublishReadiness({
      tenantId,
      projectId,
      targetVersion: 1,
      qaResult: mockPassedQa,
      customerApproved: true,
      paymentConfirmed: true,
    });
    assert.equal(evalD.canPublish, true);
    assert.equal(evalD.blockingReasons.length, 0);
  });
});
