/**
 * Core Six Fleet Cross-Environment & Hermes Universal Access Test Suite
 * StratXcel Automation Platform
 *
 * Verifies:
 * 1. All 6 core providers (AWS, Meta Developers, Supabase, Vercel, GitHub, Google)
 * 2. Cross-environment dispatching across A (Windows), B (Admin), and C (AWS Linux)
 * 3. Preference order: NATIVE_MCP -> REMOTE_MCP_BRIDGE -> VERIFIED_PROVIDER_API -> SDK_CLI -> BROWSER
 * 4. Confirmation gating on high-consequence operations
 * 5. Tenant isolation, zero secret leakage, and audit logging
 * 6. Hermes natural-language decomposition and end-to-end channel ingress (WhatsApp, Telegram, Web, Admin)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  CORE_SIX_FLEET,
  getCoreFleetProvider,
  listAllCoreCapabilities,
  type CoreProviderDomain,
  type ExecutionEnvironmentId,
} from "../mcp/core-fleet.ts";

import {
  decomposeNaturalLanguageIntent,
} from "../resources/intent-decomposer.ts";

import {
  selectOptimalEnvironment,
  resolveExecutionMethod,
  executeCoreMcpCapability,
  executeDecomposedPlan,
} from "../resources/core-mcp-router.ts";

describe("Core Six Fleet Specification & Integrity", () => {
  it("only the six canonical primary domains are registered in CORE_SIX_FLEET", () => {
    const domains = Object.keys(CORE_SIX_FLEET);
    assert.equal(domains.length, 6);
    assert.deepEqual(domains.sort(), [
      "AWS",
      "GitHub",
      "Google",
      "Meta Developers",
      "Supabase",
      "Vercel",
    ]);
  });

  it("every core provider has 3-environment availability definitions (A, B, C)", () => {
    for (const [name, provider] of Object.entries(CORE_SIX_FLEET)) {
      assert.ok(provider.environmentAvailability.A_WINDOWS.supported, `${name} must support Windows`);
      assert.ok(provider.environmentAvailability.B_ADMIN.supported, `${name} must support Admin`);
      assert.ok(provider.environmentAvailability.C_AWS_LINUX.supported, `${name} must support AWS Linux`);

      assert.ok(provider.environmentAvailability.A_WINDOWS.authSource.length > 0);
      assert.ok(provider.environmentAvailability.B_ADMIN.authSource.length > 0);
      assert.ok(provider.environmentAvailability.C_AWS_LINUX.authSource.length > 0);
    }
  });

  it("every core capability has strict risk levels and confirmation policies", () => {
    const caps = listAllCoreCapabilities();
    assert.ok(caps.length >= 25, `Expected at least 25 capabilities across 6 providers, got ${caps.length}`);

    for (const cap of caps) {
      assert.ok(cap.capabilityKey.includes("."), `Capability ${cap.capabilityKey} must be namespaced`);
      assert.ok(
        ["read_only", "low", "medium", "high", "destructive"].includes(cap.riskLevel),
        `Invalid risk level ${cap.riskLevel} on ${cap.capabilityKey}`
      );
      assert.ok(
        ["autonomous", "confirmation_required", "strictly_blocked"].includes(cap.confirmationPolicy),
        `Invalid confirmation policy on ${cap.capabilityKey}`
      );

      if (cap.isHighConsequence) {
        assert.equal(
          cap.confirmationPolicy,
          "confirmation_required",
          `High-consequence capability ${cap.capabilityKey} must require confirmation`
        );
      }
    }
  });
});

describe("Cross-Environment Router & Preference Hierarchy (A, B, C)", () => {
  it("routes each of the six providers to the optimal environment", () => {
    assert.equal(selectOptimalEnvironment("GitHub"), "A_WINDOWS");
    assert.equal(selectOptimalEnvironment("Google"), "C_AWS_LINUX");
    assert.equal(selectOptimalEnvironment("Supabase"), "B_ADMIN");
    assert.equal(selectOptimalEnvironment("Vercel"), "B_ADMIN");
    assert.equal(selectOptimalEnvironment("AWS"), "A_WINDOWS");
    assert.equal(selectOptimalEnvironment("Meta Developers"), "B_ADMIN");
  });

  it("follows the canonical preference order without fabricating MCP status", () => {
    // GitHub on Windows: Native MCP
    const ghWin = resolveExecutionMethod("GitHub", "A_WINDOWS");
    assert.equal(ghWin.executionMethod, "NATIVE_MCP");

    // GitHub on AWS Linux: Remote Bridge
    const ghEc2 = resolveExecutionMethod("GitHub", "C_AWS_LINUX");
    assert.equal(ghEc2.executionMethod, "REMOTE_MCP_BRIDGE");

    // Supabase on Admin: Verified Provider API with RLS
    const supaAdmin = resolveExecutionMethod("Supabase", "B_ADMIN");
    assert.equal(supaAdmin.executionMethod, "VERIFIED_PROVIDER_API");

    // AWS on Windows: Verified CLI
    const awsWin = resolveExecutionMethod("AWS", "A_WINDOWS");
    assert.equal(awsWin.executionMethod, "SDK_CLI");

    // Google on EC2: Browser CDP
    const googleEc2 = resolveExecutionMethod("Google", "C_AWS_LINUX");
    assert.equal(googleEc2.executionMethod, "BROWSER");
  });

  it("executes safe operations across all six providers and all three environments", async () => {
    const testCases: Array<{
      provider: CoreProviderDomain;
      capability: string;
      env: ExecutionEnvironmentId;
    }> = [
      { provider: "AWS", capability: "aws.infrastructure_inspect", env: "A_WINDOWS" },
      { provider: "AWS", capability: "aws.ec2_status", env: "B_ADMIN" },
      { provider: "AWS", capability: "aws.ssm_command", env: "C_AWS_LINUX" },
      { provider: "Meta Developers", capability: "meta.app_inspect", env: "A_WINDOWS" },
      { provider: "Meta Developers", capability: "meta.page_read", env: "B_ADMIN" },
      { provider: "Meta Developers", capability: "meta.instagram_read", env: "C_AWS_LINUX" },
      { provider: "Supabase", capability: "supabase.schema_inspect", env: "A_WINDOWS" },
      { provider: "Supabase", capability: "supabase.customer_query", env: "B_ADMIN" },
      { provider: "Supabase", capability: "supabase.record_update", env: "C_AWS_LINUX" },
      { provider: "Vercel", capability: "vercel.domain_status", env: "A_WINDOWS" },
      { provider: "Vercel", capability: "vercel.production_health", env: "B_ADMIN" },
      { provider: "Vercel", capability: "vercel.deployment_inspect", env: "C_AWS_LINUX" },
      { provider: "GitHub", capability: "github.repo_read", env: "A_WINDOWS" },
      { provider: "GitHub", capability: "github.branch_status", env: "B_ADMIN" },
      { provider: "GitHub", capability: "github.pr_inspect", env: "C_AWS_LINUX" },
      { provider: "Google", capability: "google.drive_search", env: "A_WINDOWS" },
      { provider: "Google", capability: "google.workspace_inspect", env: "B_ADMIN" },
      { provider: "Google", capability: "google.drive_read", env: "C_AWS_LINUX" },
    ];

    for (const tc of testCases) {
      const res = await executeCoreMcpCapability(tc.capability, {}, {
        tenantId: "tenant_test_123",
        targetEnvironment: tc.env,
        actorKind: "hermes",
      });

      assert.equal(res.success, true, `Execution failed for ${tc.capability} in ${tc.env}`);
      assert.equal(res.provider, tc.provider);
      assert.equal(res.environment, tc.env);
      assert.equal(res.status, "COMPLETED");
      assert.ok(res.auditId.startsWith("mcp-audit-"));
      assert.equal(res.tenantIsolationVerified, true);
      assert.equal(res.secretLeakagePrevented, true);
    }
  });
});

describe("High-Consequence Operations & Confirmation Gating", () => {
  it("blocks unconfirmed high-consequence operations and returns confirmation prompt", async () => {
    const highRiskCaps = [
      "vercel.deploy_promote",
      "aws.instance_reboot",
      "supabase.destructive_write",
      "meta.post_publish",
      "github.push_files",
    ];

    for (const capKey of highRiskCaps) {
      const unconfirmed = await executeCoreMcpCapability(capKey, {}, {
        tenantId: "tenant_corp",
        actorKind: "hermes",
        confirmedByFounder: false,
      });

      assert.equal(unconfirmed.success, false);
      assert.equal(unconfirmed.status, "CONFIRMATION_REQUIRED");
      assert.equal(unconfirmed.requiresConfirmation, true);
      assert.ok(unconfirmed.formattedMessage.includes("CONFIRMATION REQUIRED"));
      assert.ok(unconfirmed.auditId.startsWith("mcp-audit-"));

      // Now verify that when confirmedByFounder === true, execution succeeds!
      const confirmed = await executeCoreMcpCapability(capKey, {}, {
        tenantId: "tenant_corp",
        actorKind: "hermes",
        confirmedByFounder: true,
      });

      assert.equal(confirmed.success, true);
      assert.equal(confirmed.status, "COMPLETED");
      assert.equal(confirmed.requiresConfirmation, false);
      assert.ok(confirmed.auditId.startsWith("mcp-audit-"));
    }
  });
});

describe("Natural Language Intent Decomposition", () => {
  it("decomposes 'Deploy the latest main branch' into GitHub branch check + Vercel deployment promote", () => {
    const plan = decomposeNaturalLanguageIntent("Deploy the latest main branch");
    assert.equal(plan.inferredIntent, "Production Deployment Pipeline");
    assert.equal(plan.tasks.length, 2);

    assert.equal(plan.tasks[0].provider, "GitHub");
    assert.equal(plan.tasks[0].capabilityKey, "github.branch_status");
    assert.equal(plan.tasks[0].isHighConsequence, false);

    assert.equal(plan.tasks[1].provider, "Vercel");
    assert.equal(plan.tasks[1].capabilityKey, "vercel.deploy_promote");
    assert.equal(plan.tasks[1].isHighConsequence, true);
    assert.equal(plan.tasks[1].requiresConfirmation, true);
    assert.equal(plan.requiresFounderConfirmation, true);
  });

  it("decomposes 'Check whether our production site is healthy and tell me what is wrong' into multi-provider diagnostics", () => {
    const plan = decomposeNaturalLanguageIntent("Check whether our production site is healthy and tell me what is wrong");
    assert.equal(plan.inferredIntent, "Production Multi-Provider Health Diagnostics");
    assert.equal(plan.tasks.length, 3);

    assert.equal(plan.tasks[0].provider, "Vercel");
    assert.equal(plan.tasks[0].capabilityKey, "vercel.production_health");

    assert.equal(plan.tasks[1].provider, "AWS");
    assert.equal(plan.tasks[1].capabilityKey, "aws.ec2_status");

    assert.equal(plan.tasks[2].provider, "Vercel");
    assert.equal(plan.tasks[2].capabilityKey, "vercel.domain_status");

    assert.equal(plan.requiresFounderConfirmation, false);
  });

  it("decomposes 'Find the customer record and update their status' into Supabase query + update", () => {
    const plan = decomposeNaturalLanguageIntent("Find the customer record and update their status", {
      tenantId: "acme_corp",
    });
    assert.equal(plan.inferredIntent, "Customer Record Query & Lifecycle Update");
    assert.equal(plan.tasks.length, 2);

    assert.equal(plan.tasks[0].provider, "Supabase");
    assert.equal(plan.tasks[0].capabilityKey, "supabase.customer_query");

    assert.equal(plan.tasks[1].provider, "Supabase");
    assert.equal(plan.tasks[1].capabilityKey, "supabase.record_update");
    assert.equal(plan.requiresFounderConfirmation, false);
  });
});

describe("End-to-End Chat Ingress Scenarios (WhatsApp, Telegram, Web, Admin)", () => {
  it("Scenario 1: WhatsApp -> Hermes -> GitHub (Read Repository & Branch Status)", async () => {
    const plan = decomposeNaturalLanguageIntent("Check GitHub repository status and commit history", {
      tenantId: "tenant_wa",
      channel: "whatsapp",
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: "tenant_wa",
      channel: "whatsapp",
      actorKind: "hermes",
    });

    assert.equal(execution.planStatus, "ALL_COMPLETED");
    assert.ok(execution.stepResults.length >= 1);
    assert.equal(execution.stepResults[0].provider, "GitHub");
    assert.ok(execution.overallMessage.includes("GitHub"));
    assert.ok(execution.overallMessage.includes("Executed via"));
  });

  it("Scenario 2: WhatsApp -> Hermes -> Vercel (Production Deployment Confirmation Gate)", async () => {
    const plan = decomposeNaturalLanguageIntent("Deploy the latest main branch", {
      tenantId: "tenant_wa",
      channel: "whatsapp",
      confirmedByFounder: false,
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: "tenant_wa",
      channel: "whatsapp",
      actorKind: "hermes",
      confirmedByFounder: false,
    });

    // Step 1 (GitHub branch status) succeeds, Step 2 (Vercel deploy) halts for confirmation
    assert.equal(execution.planStatus, "CONFIRMATION_PENDING");
    assert.ok(execution.overallMessage.includes("CONFIRMATION REQUIRED"));
    assert.ok(execution.overallMessage.includes("Vercel"));
    assert.ok(execution.overallMessage.includes("Reply *CONFIRM* to execute"));
  });

  it("Scenario 3: Telegram -> Hermes -> AWS (EC2 Status Diagnostics)", async () => {
    const plan = decomposeNaturalLanguageIntent("Check whether our AWS EC2 instance is healthy", {
      tenantId: "tenant_tg",
      channel: "telegram",
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: "tenant_tg",
      channel: "telegram",
      actorKind: "hermes",
    });

    assert.equal(execution.planStatus, "ALL_COMPLETED");
    assert.equal(execution.stepResults[0].provider, "AWS");
    assert.ok(execution.overallMessage.includes("AWS"));
    assert.ok(execution.overallMessage.includes("Host:"));
  });

  it("Scenario 4: Web -> Hermes -> Supabase (Tenant Scoped Customer Query)", async () => {
    const plan = decomposeNaturalLanguageIntent("Find the customer record and update their status", {
      tenantId: "tenant_web_client",
      channel: "web",
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: "tenant_web_client",
      channel: "web",
      actorKind: "hermes",
    });

    assert.equal(execution.planStatus, "ALL_COMPLETED");
    assert.equal(execution.stepResults[0].provider, "Supabase");
    assert.equal(execution.stepResults[0].output.tenantId, "tenant_web_client");
    assert.equal(execution.stepResults[0].tenantIsolationVerified, true);
  });

  it("Scenario 5: Web -> Hermes -> Google (Founder Drive Asset Search)", async () => {
    const plan = decomposeNaturalLanguageIntent("Search Google Drive for client proposals", {
      tenantId: "founder_tenant",
      channel: "web",
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: "founder_tenant",
      channel: "web",
      actorKind: "hermes",
    });

    assert.equal(execution.planStatus, "ALL_COMPLETED");
    assert.equal(execution.stepResults[0].provider, "Google");
    assert.equal(execution.stepResults[0].environment, "C_AWS_LINUX");
    assert.equal(execution.stepResults[0].executionMethod, "BROWSER");
    assert.ok(execution.overallMessage.includes("Google"));
  });

  it("Scenario 6: Admin chat -> Hermes -> Meta (Developer App & Page Read)", async () => {
    const plan = decomposeNaturalLanguageIntent("Inspect Meta developer app and page feed", {
      tenantId: "tenant_admin",
      channel: "admin",
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: "tenant_admin",
      channel: "admin",
      actorKind: "hermes",
    });

    assert.equal(execution.planStatus, "ALL_COMPLETED");
    assert.equal(execution.stepResults[0].provider, "Meta Developers");
    assert.ok(execution.overallMessage.includes("Meta Developers"));
    assert.equal(execution.stepResults[0].secretLeakagePrevented, true);
  });
});
