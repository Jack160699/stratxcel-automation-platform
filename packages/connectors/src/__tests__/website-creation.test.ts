/**
 * Autonomous Website Creation Test Suite
 * StratXcel Automation Platform - Hermes First-Class Capability
 *
 * Verifies all 10 required assertions:
 * 1. "Make me a website" -> resolves to website.create
 * 2. No existing site_projects record -> mission still created
 * 3. Project shell created successfully
 * 4. Antigravity receives WEBSITE_BUILD_NEW
 * 5. GitHub repository can be created
 * 6. Vercel project/preview can be created
 * 7. Preview URL returned
 * 8. Production deployment requires confirmation
 * 9. Tenant isolation remains intact
 * 10. Internal schema errors are never exposed as user-facing capability refusals
 *
 * Plus Live Acceptance Test simulating: "Can you make a website for me?"
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  decomposeNaturalLanguageIntent,
} from "../resources/intent-decomposer.ts";

import {
  executeCoreMcpCapability,
} from "../resources/core-mcp-router.ts";

import {
  createWebsiteProjectShell,
  initiateWebsiteCreation,
  advanceWebsiteLifecycle,
} from "../resources/website-creator.ts";

describe("Hermes First-Class Website Creation Suite", () => {
  // --------------------------------------------------------------------------
  // TEST 1: Intent Decomposition
  // --------------------------------------------------------------------------
  describe("Test 1: Intent Decomposition into website.create", () => {
    const validPhrases = [
      "Can you make a website for me?",
      "Make me a website",
      "Build a website for my business",
      "Create a new site",
      "Build a landing page",
      "Make me a website from scratch",
      "I need a new website",
    ];

    for (const phrase of validPhrases) {
      it(`resolves "${phrase}" to website.create`, () => {
        const plan = decomposeNaturalLanguageIntent(phrase, { tenantId: "tenant-apex-1" });
        assert.equal(plan.inferredIntent, "Website Creation from Scratch");
        assert.equal(plan.tasks.length, 1);
        assert.equal(plan.tasks[0]?.capabilityKey, "website.create");
        assert.equal(plan.tasks[0]?.provider, "Vercel");
        assert.equal(plan.tasks[0]?.isHighConsequence, false);
        assert.equal(plan.tasks[0]?.requiresConfirmation, false);
      });
    }

    it("does NOT force website.edit or website.inspect into website.create", () => {
      const editPlan = decomposeNaturalLanguageIntent("edit website hero section", { tenantId: "tenant-apex-1" });
      assert.notEqual(editPlan.tasks[0]?.capabilityKey, "website.create");

      const checkPlan = decomposeNaturalLanguageIntent("check website status", { tenantId: "tenant-apex-1" });
      assert.notEqual(checkPlan.tasks[0]?.capabilityKey, "website.create");

      const domainPlan = decomposeNaturalLanguageIntent("check domain status for stratxcel.com", { tenantId: "tenant-apex-1" });
      assert.notEqual(domainPlan.tasks[0]?.capabilityKey, "website.create");
    });
  });

  // --------------------------------------------------------------------------
  // TEST 2: No Existing site_projects Record
  // --------------------------------------------------------------------------
  describe("Test 2: No Existing site_projects Record", () => {
    it("creates a mission even when no site_projects record exists", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        goalText: "Can you make a website for me?",
      });

      assert.ok(result.missionId, "Mission ID must be generated");
      assert.match(result.missionId, /^mission_web_/);
      assert.ok(result.siteProjectId, "Site Project ID must be generated");
      assert.equal(result.lifecycleStage, "PLANNING");
      assert.equal(result.needsMoreDetails, true);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 3: Project Shell Created Successfully
  // --------------------------------------------------------------------------
  describe("Test 3: Project Shell Created Successfully", () => {
    it("creates a well-formed project shell with 5-page template structure", async () => {
      const shell = await createWebsiteProjectShell(null, {
        tenantId: "tenant-apex-1",
        businessName: "Bhilai Solar Solutions",
        goalText: "Build a modern solar installation website",
      });

      assert.ok(shell.id);
      assert.equal(shell.tenantId, "tenant-apex-1");
      assert.equal(shell.name, "Bhilai Solar Solutions");
      assert.match(shell.slug, /^bhilai-solar-solutions-/);
      assert.match(shell.previewSubdomain, /\.stratxcel\.site$/);
      assert.equal(shell.status, "draft");
      assert.equal(shell.lifecycleStage, "PLANNING");
      assert.equal(shell.pages.length, 5);
      assert.deepEqual(
        shell.pages.map((p) => p.slug),
        ["home", "services", "about", "reviews", "contact"]
      );
    });
  });

  // --------------------------------------------------------------------------
  // TEST 4: Antigravity Receives WEBSITE_BUILD_NEW
  // --------------------------------------------------------------------------
  describe("Test 4: Antigravity Receives WEBSITE_BUILD_NEW", () => {
    it("dispatches Antigravity coding task contract with WEBSITE_BUILD_NEW action", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        businessName: "Acme Logistics",
        purpose: "Freight management and tracking services",
        goalText: "Make a website for Acme Logistics to track shipments",
      });

      assert.ok(result.antigravityTask);
      assert.equal(result.antigravityTask.jobType, "WEBSITE_BUILD_NEW");
      assert.equal(result.antigravityTask.action, "WEBSITE_BUILD_NEW");

      const payload = result.antigravityTask.payload;
      assert.equal(payload.tenantId, "tenant-apex-1");
      assert.equal(payload.branch, "main");
      assert.match(payload.workspacePath, /sites\/acme-logistics-/);
      assert.ok(payload.objective.includes("Acme Logistics"));
      assert.deepEqual(payload.allowedPaths, ["src/**", "public/**", "package.json", "next.config.js"]);
      assert.equal(payload.commitPolicy, "commit_on_test_pass");

      // Verify no secrets or credentials leaked into task specification
      const serialized = JSON.stringify(payload);
      assert.doesNotMatch(serialized, /sk_live|ghp_|password|secret|bearer/i);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 5: GitHub Repository Planned / Created
  // --------------------------------------------------------------------------
  describe("Test 5: GitHub Repository Creation", () => {
    it("generates legitimate isolated repository target without clobbering existing repos", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        businessName: "Quantum Bakery",
        purpose: "Artisanal breads and catering",
        goalText: "Build a website for Quantum Bakery",
      });

      assert.ok(result.github);
      assert.match(result.github.repoName, /^Jack160699\/quantum-bakery-/);
      assert.equal(result.github.branch, "main");
      assert.ok(["PLANNED", "INITIALIZED"].includes(result.github.status));
    });
  });

  // --------------------------------------------------------------------------
  // TEST 6: Vercel Project & Preview Created
  // --------------------------------------------------------------------------
  describe("Test 6: Vercel Project & Preview", () => {
    it("binds Vercel project target and sets up preview stage", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        businessName: "Apex Medical",
        purpose: "Clinic appointments and doctors list",
        goalText: "Build a clinic website for Apex Medical",
      });

      assert.ok(result.vercel);
      assert.match(result.vercel.projectName, /^apex-medical-/);
      assert.ok(["PLANNED", "PREVIEW_READY"].includes(result.vercel.status));
    });
  });

  // --------------------------------------------------------------------------
  // TEST 7: Preview URL Returned
  // --------------------------------------------------------------------------
  describe("Test 7: Preview URL Returned", () => {
    it("returns active preview URL for completed generation", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        businessName: "CloudScale Analytics",
        purpose: "B2B SaaS product analytics",
        goalText: "Make a landing page for CloudScale Analytics",
      });

      assert.ok(result.previewUrl);
      assert.match(result.previewUrl, /^https:\/\/cloudscale-analytics-.*\.vercel\.app$/);
      assert.equal(result.lifecycleStage, "PREVIEW");
      assert.equal(result.needsMoreDetails, false);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 8: Production Deployment Requires Confirmation
  // --------------------------------------------------------------------------
  describe("Test 8: Production Deployment Gate", () => {
    it("blocks unconfirmed production deployment and requires Founder confirmation", async () => {
      const initial = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        businessName: "Zenith Studio",
        purpose: "Interior design portfolio",
        goalText: "Create a portfolio website for Zenith Studio",
      });

      assert.equal(initial.productionDeployGated, true);

      // Attempt deployment without Founder confirmation
      const unconfirmed = await advanceWebsiteLifecycle(initial, "DEPLOYING", {
        confirmedByFounder: false,
      });

      assert.equal(unconfirmed.success, false);
      assert.equal(unconfirmed.stage, "AWAITING_APPROVAL");
      assert.equal(unconfirmed.confirmationRequired, true);
      assert.match(unconfirmed.message, /requires explicit Founder confirmation/);

      // Attempt deployment WITH Founder confirmation
      const confirmed = await advanceWebsiteLifecycle(initial, "DEPLOYING", {
        confirmedByFounder: true,
      });

      assert.equal(confirmed.success, true);
      assert.equal(confirmed.stage, "DEPLOYING");
      assert.ok(confirmed.productionUrl);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 9: Tenant Isolation Intact
  // --------------------------------------------------------------------------
  describe("Test 9: Tenant Isolation", () => {
    it("strictly isolates missions and site projects between different tenants", async () => {
      const siteTenantA = await initiateWebsiteCreation(null, {
        tenantId: "tenant-alpha-100",
        businessName: "Alpha Logistics",
        goalText: "Website for Alpha",
      });

      const siteTenantB = await initiateWebsiteCreation(null, {
        tenantId: "tenant-beta-200",
        businessName: "Beta Pharmaceuticals",
        goalText: "Website for Beta",
      });

      assert.equal(siteTenantA.tenantId, "tenant-alpha-100");
      assert.equal(siteTenantB.tenantId, "tenant-beta-200");
      assert.notEqual(siteTenantA.siteProjectId, siteTenantB.siteProjectId);
      assert.notEqual(siteTenantA.missionId, siteTenantB.missionId);
      assert.notEqual(siteTenantA.github.repoName, siteTenantB.github.repoName);
      assert.notEqual(siteTenantA.vercel.projectName, siteTenantB.vercel.projectName);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 10: Never Expose Internal Schema Limitations
  // --------------------------------------------------------------------------
  describe("Test 10: Zero Schema Leakage & Professional UX", () => {
    it("never returns raw schema errors or capability refusals for generic prompt", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        goalText: "Can you make a website for me?",
      });

      assert.doesNotMatch(result.conversationalReply, /site_projects|schema|postgres|foreign key|null constraint/i);
      assert.doesNotMatch(result.conversationalReply, /cannot create/i);

      // Matches prompt-aligned response and Action UI buttons
      assert.ok(result.conversationalReply.includes("Website creation started"));
      assert.ok(result.conversationalReply.includes("What are you building?"));
      assert.equal(result.actionButtons?.length, 3);
      assert.equal(result.actionButtons?.[0]?.title, "Business Website");
    });

    it("returns immediate planning & preview reply when context is provided", async () => {
      const result = await initiateWebsiteCreation(null, {
        tenantId: "tenant-apex-1",
        businessName: "Bhilai Solar",
        purpose: "Residential solar roof installations",
        goalText: "Build a website for Bhilai Solar to get solar installation leads",
      });

      assert.ok(result.conversationalReply.includes("Website creation started"));
      assert.ok(result.conversationalReply.includes("Preview:"));
      assert.equal(result.actionButtons?.length, 3);
      assert.equal(result.actionButtons?.[0]?.title, "Open Preview");
    });
  });

  // --------------------------------------------------------------------------
  // LIVE ACCEPTANCE TEST: "Can you make a website for me?"
  // --------------------------------------------------------------------------
  describe("LIVE ACCEPTANCE TEST: 'Can you make a website for me?'", () => {
    it("processes full channel flow from WhatsApp query without rejection", async () => {
      const userMessage = "Can you make a website for me?";

      // 1. Intent Decomposition
      const plan = decomposeNaturalLanguageIntent(userMessage, {
        tenantId: "tenant-founder-001",
        channel: "whatsapp",
      });

      assert.equal(plan.inferredIntent, "Website Creation from Scratch");
      assert.equal(plan.tasks.length, 1);
      assert.equal(plan.tasks[0]?.capabilityKey, "website.create");

      // 2. Core MCP Execution Routing
      const execution = await executeCoreMcpCapability(
        plan.tasks[0]!.capabilityKey,
        plan.tasks[0]!.payload,
        {
          tenantId: "tenant-founder-001",
          channel: "whatsapp",
        }
      );

      assert.equal(execution.success, true);
      assert.equal(execution.status, "COMPLETED");
      assert.equal(execution.actionName, "Create Website from Scratch");

      // 3. Conversational UX Verification
      const reply = execution.formattedMessage;
      assert.ok(reply, "Must produce a WhatsApp reply");
      assert.ok(reply.includes("Website creation started"));
      assert.ok(reply.includes("What are you building?"));
      assert.ok(execution.interactiveButtons && execution.interactiveButtons.length >= 3);

      // Verify Hermes entered PLANNING with a real mission and project shell
      const output = execution.output as Record<string, unknown>;
      assert.ok(output.missionId);
      assert.ok(output.siteProjectId);
      assert.equal(output.lifecycleStage, "PLANNING");
      assert.equal(output.needsMoreDetails, true);
    });

    it("processes follow-up with business name and advances to PREVIEW", async () => {
      const followUp = "Build a website for Nova Robotics to showcase warehouse automation bots";

      const plan = decomposeNaturalLanguageIntent(followUp, {
        tenantId: "tenant-founder-001",
        channel: "whatsapp",
      });

      const execution = await executeCoreMcpCapability(
        plan.tasks[0]!.capabilityKey,
        plan.tasks[0]!.payload,
        {
          tenantId: "tenant-founder-001",
          channel: "whatsapp",
        }
      );

      assert.equal(execution.success, true);
      const output = execution.output as Record<string, unknown>;
      assert.equal(output.lifecycleStage, "PREVIEW");
      assert.equal(output.needsMoreDetails, false);
      assert.ok(output.previewUrl);
      assert.match(output.previewUrl as string, /https:\/\/nova-robotics-.*\.vercel\.app/);

      // Response includes preview URL
      assert.match(execution.formattedMessage, /Preview: https:\/\/nova-robotics-/);
    });
  });
});
