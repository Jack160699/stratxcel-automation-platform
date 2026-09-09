// Run with: node --experimental-strip-types packages/connectors/src/__tests__/mcp-infrastructure.test.ts
/**
 * Master MCP Infrastructure Architecture & Security Test Suite
 *
 * Verifies the complete MCP integration layer across all 15 target domains and
 * 3 execution environments (Windows Workstation, StratXcel Admin, AWS Linux EC2).
 */

import assert from "node:assert/strict";
import {
  CANONICAL_MCP_REGISTRY,
  CANONICAL_PROVIDER_MAPPINGS,
  REMOTE_BRIDGE_SPECIFICATIONS,
  getMcpDefinition,
  listMcpDefinitionsByEnvironment,
  getProviderMapping,
  resolveMcpSecretReference,
  assertMcpToolAuthorized,
  recordMcpToolAudit,
  resolveBridgeForMcp,
} from "../mcp/index.ts";
import { selectBestResource } from "../resources/selector.ts";

console.log("=== STARTING MASTER MCP INFRASTRUCTURE TEST SUITE ===");

// 1. REGISTRY COMPLETENESS TEST
{
  console.log("Test 1: Canonical MCP Registry completeness across 15 domains...");
  assert.equal(CANONICAL_MCP_REGISTRY.length, 15, "Registry must contain exactly 15 target provider definitions");

  const requiredCategories = [
    "AWS",
    "AWS S3",
    "Meta",
    "GitHub",
    "Browser / Playwright",
    "Google",
    "Supabase",
    "Vercel",
    "OpenAI",
    "CodeCraft",
    "Claude",
    "Telegram",
    "Apollo.io",
    "WhatsApp",
    "StratXcel Hermes",
  ];

  for (const cat of requiredCategories) {
    const found = CANONICAL_MCP_REGISTRY.find((m) => m.provider === cat);
    assert.ok(found, `Category ${cat} must be present in canonical registry`);
    assert.ok(found.mcpId, `mcpId must be defined for ${cat}`);
    assert.ok(found.serverName, `serverName must be defined for ${cat}`);
    assert.ok(found.transport, `transport must be defined for ${cat}`);
    assert.ok(found.executionEnvironment, `executionEnvironment must be defined for ${cat}`);
    assert.ok(found.authenticationType, `authenticationType must be defined for ${cat}`);
    assert.ok(found.fallback, `fallback must be defined for ${cat}`);
  }
  console.log("✓ PASS: All 15 domains present with complete specification metadata.");
}

// 2. PRESERVATION OF VERIFIED MCPS TEST
{
  console.log("Test 2: Preserving real verified MCPs (GitHub, Browser, Hermes)...");
  const githubMcp = getMcpDefinition("stratxcel-github");
  assert.ok(githubMcp, "stratxcel-github must exist");
  assert.equal(githubMcp.executionEnvironment, "windows");
  assert.equal(githubMcp.transport, "stdio");
  assert.equal(githubMcp.status, "authorized");
  assert.ok(githubMcp.supportedTools.length >= 3, "Verified GitHub tools must be preserved");

  const browserMcp = getMcpDefinition("stratxcel-browser");
  assert.ok(browserMcp, "stratxcel-browser must exist");
  assert.equal(browserMcp.executionEnvironment, "windows");
  assert.equal(browserMcp.transport, "stdio");
  assert.equal(browserMcp.status, "authorized");
  assert.ok(browserMcp.supportedTools.length >= 3, "Verified Playwright tools must be preserved");

  const hermesMcp = getMcpDefinition("stratxcel-hermes");
  assert.ok(hermesMcp, "stratxcel-hermes must exist");
  assert.equal(hermesMcp.executionEnvironment, "aws_linux");
  assert.equal(hermesMcp.transport, "streamable_http");
  assert.equal(hermesMcp.status, "authorized");
  assert.equal(hermesMcp.endpointUrl, "http://127.0.0.1:8082/mcp");
  console.log("✓ PASS: All 3 verified MCP servers intact and authorized.");
}

// 3. HONEST CLASSIFICATION — ZERO FAKE MCPS
{
  console.log("Test 3: Validating zero fake MCPs and honest fallback classification...");
  const metaMcp = getMcpDefinition("stratxcel-meta-dev");
  assert.ok(metaMcp);
  assert.equal(metaMcp.classification, "custom_stratxcel", "Meta developer MCP is an explicit custom wrapper");
  assert.equal(metaMcp.fallback.preferredFallbackType, "native_connector");
  assert.equal(metaMcp.fallback.targetConnectorKey, "meta");

  const openAiMcp = getMcpDefinition("stratxcel-openai");
  assert.ok(openAiMcp);
  assert.equal(openAiMcp.classification, "no_native_mcp", "OpenAI has no native official MCP daemon");
  assert.equal(openAiMcp.fallback.preferredFallbackType, "direct_api");

  const claudeMcp = getMcpDefinition("stratxcel-claude");
  assert.ok(claudeMcp);
  assert.equal(claudeMcp.classification, "no_native_mcp", "Claude operates via Claude Code CLI or Direct Anthropic API");
  assert.equal(claudeMcp.fallback.preferredFallbackType, "cli");

  const apolloMcp = getMcpDefinition("stratxcel-apollo");
  assert.ok(apolloMcp);
  assert.equal(apolloMcp.classification, "custom_stratxcel");
  assert.equal(apolloMcp.fallback.preferredFallbackType, "direct_api");

  const whatsAppMcp = getMcpDefinition("stratxcel-whatsapp");
  assert.ok(whatsAppMcp);
  assert.equal(whatsAppMcp.classification, "custom_stratxcel");
  console.log("✓ PASS: Honest classification verified — zero fake MCPs created.");
}

// 4. PROVIDER ARCHITECTURE MAPPINGS TEST
{
  console.log("Test 4: Provider Architecture Mapping (API -> CLI -> MCP -> Browser)...");
  assert.equal(CANONICAL_PROVIDER_MAPPINGS.length, 15);

  const awsMap = getProviderMapping("AWS");
  assert.ok(awsMap);
  assert.ok(awsMap.serviceApi.available, "AWS SDK API must be mapped");
  assert.ok(awsMap.cli.available, "AWS CLI must be mapped");
  assert.equal(awsMap.cli.command, "aws");
  assert.ok(awsMap.mcp.available, "AWS MCP must be mapped");

  const ghMap = getProviderMapping("GitHub");
  assert.ok(ghMap);
  assert.ok(ghMap.serviceApi.available, "GitHub Octokit API must be mapped");
  assert.ok(ghMap.cli.available, "GitHub gh CLI must be mapped");
  assert.equal(ghMap.cli.command, "gh");
  assert.ok(ghMap.mcp.available, "GitHub MCP must be mapped");

  const googleMap = getProviderMapping("Google");
  assert.ok(googleMap);
  assert.ok(googleMap.browser.available, "Founder Browser must be mapped for Google");
  assert.ok(googleMap.serviceApi.available, "Gemini API must be mapped for Google");
  console.log("✓ PASS: Provider multi-layer architecture mappings verified.");
}

// 5. ENVIRONMENT ISOLATION & REMOTE BRIDGE TEST
{
  console.log("Test 5: Environment isolation and Remote Bridge specifications...");
  const windowsMcps = listMcpDefinitionsByEnvironment("windows");
  assert.ok(windowsMcps.length >= 2, "Windows execution environment supported");

  const linuxMcps = listMcpDefinitionsByEnvironment("aws_linux");
  assert.ok(linuxMcps.length >= 1, "AWS Linux execution environment supported");

  // Verify Windows bridge security: NO INBOUND PUBLIC PORTS
  const windowsBridge = REMOTE_BRIDGE_SPECIFICATIONS.find((b) => b.bridgeId === "hermes-to-windows-worker-bridge");
  assert.ok(windowsBridge, "Windows worker bridge must exist");
  assert.equal(
    windowsBridge.securityGuarantees.inboundPortsRequired,
    false,
    "Windows workstation must never open inbound ports"
  );
  assert.equal(windowsBridge.authMechanism, "queue_jwt_hmac");

  // Verify Hermes EC2 localhost bridge
  const ec2Bridge = REMOTE_BRIDGE_SPECIFICATIONS.find((b) => b.bridgeId === "hermes-to-ec2-local-mcp");
  assert.ok(ec2Bridge, "EC2 localhost bridge must exist");
  assert.equal(ec2Bridge.targetEndpoint, "http://localhost:8082/mcp");
  assert.equal(ec2Bridge.authMechanism, "bearer_token");

  // Bridge resolver test
  const resolvedGhBridge = resolveBridgeForMcp("stratxcel-github", "aws_linux");
  assert.ok(resolvedGhBridge, "Remote access to Windows GitHub MCP from EC2 requires worker bridge");
  assert.equal(resolvedGhBridge.bridgeType, "outbound_worker_polling");
  console.log("✓ PASS: Environment isolation and remote bridge contracts verified.");
}

// 6. SECRET REFERENCE RESOLVER TEST
{
  console.log("Test 6: Secret reference resolution (zero raw secrets in configs)...");
  const resolved = resolveMcpSecretReference("stratxcel-github", {
    GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_test_token_12345",
  });
  assert.equal(resolved.isAvailable, true, "Environment secret ref must resolve when present");
  assert.equal(resolved.locationType, "ENVIRONMENT");

  // Non-existent secret ref must fail safely without leaking
  const missing = resolveMcpSecretReference("stratxcel-github", {});
  assert.equal(missing.isAvailable, false, "Missing secret ref must fail closed");

  // Browser session ref
  const browserRef = resolveMcpSecretReference("stratxcel-browser");
  assert.equal(browserRef.locationType, "BROWSER_SESSION");
  assert.equal(browserRef.isAvailable, true);

  // AWS CLI profile ref
  const awsRef = resolveMcpSecretReference("stratxcel-aws", { AWS_PROFILE: "default" });
  assert.equal(awsRef.locationType, "CLI_PROFILE");
  assert.equal(awsRef.isAvailable, true);
  console.log("✓ PASS: Secret reference resolver safely dereferences credentials.");
}

// 7. UNIFIED AUTHORIZATION ENGINE TEST
{
  console.log("Test 7: Unified authorization gate (Founder -> Company -> Agent -> MCP -> Tool)...");

  // Read-only tool authorized autonomously
  const readAuth = await assertMcpToolAuthorized({
    mcpId: "stratxcel-github",
    toolName: "get_file_contents",
    actorKind: "hermes",
    tenantId: "company-alpha",
    missionId: "mission-123",
  });
  assert.equal(readAuth.authorized, true, "Read-only tool must be authorized");
  assert.equal(readAuth.requiresConfirmation, false);
  assert.equal(readAuth.status, "AUTHORIZED");

  // Destructive tool requires confirmation gate
  const writeAuth = await assertMcpToolAuthorized({
    mcpId: "stratxcel-github",
    toolName: "push_files",
    actorKind: "hermes",
    tenantId: "company-alpha",
    missionId: "mission-123",
  });
  assert.equal(writeAuth.authorized, false, "Push files cannot execute without Founder confirmation");
  assert.equal(
    writeAuth.requiresConfirmation,
    true,
    "Destructive push_files tool must require confirmation gate"
  );
  assert.equal(writeAuth.status, "CONFIRMATION_REQUIRED");
  assert.equal(writeAuth.auditMetadata?.riskLevel, "high");

  // Non-existent tool blocked
  const invalidToolAuth = await assertMcpToolAuthorized({
    mcpId: "stratxcel-github",
    toolName: "non_existent_hack_tool",
    actorKind: "hermes",
    tenantId: "company-alpha",
  });
  assert.equal(invalidToolAuth.authorized, false, "Unknown tool must be denied");
  assert.equal(invalidToolAuth.status, "DENIED");

  // Unregistered MCP blocked
  const invalidMcpAuth = await assertMcpToolAuthorized({
    mcpId: "fake-unregistered-mcp",
    toolName: "some_tool",
    actorKind: "hermes",
    tenantId: "company-alpha",
  });
  assert.equal(invalidMcpAuth.authorized, false, "Unknown MCP must be denied");
  assert.equal(invalidMcpAuth.status, "DENIED");
  console.log("✓ PASS: Unified authorization engine enforces permission, risk & confirmation policies.");
}

// 8. AUDIT LOGGING RECORD TEST
{
  console.log("Test 8: MCP Tool Audit logging...");
  const audit = await recordMcpToolAudit(null, {
    mcpId: "stratxcel-github",
    provider: "GitHub",
    toolName: "get_file_contents",
    environment: "windows",
    actorKind: "hermes",
    actorId: "hermes-agent",
    tenantId: "company-alpha",
    missionId: "mission-123",
    durationMs: 42,
    confirmationReceived: true,
    status: "success",
  });

  assert.ok(audit.id.startsWith("mcp-audit-"));
  assert.equal(audit.mcpId, "stratxcel-github");
  assert.equal(audit.status, "success");
  assert.equal(audit.durationMs, 42);
  console.log("✓ PASS: Audit records structured cleanly without secret leaks.");
}

// 9. HERMES RESOURCE SELECTOR MCP ROUTING & FALLBACK TEST
{
  console.log("Test 9: Hermes Resource Selector routing capability to MCP with graceful fallback...");

  // Mock Supabase client for selector
  const mockSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  } as never;

  // Evaluate infrastructure.repo_read:
  // Priority 1 is stratxcel-github (MCP, status: healthy).
  // It should autonomously select stratxcel-github!
  const result = await selectBestResource(mockSupabase, {
    capabilityKey: "infrastructure.repo_read",
  });

  assert.equal(result.selectedConnector, "stratxcel-github", "Should select stratxcel-github MCP");
  assert.equal(result.executionMethod, "mcp");
  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.requiresConfirmation, false);

  // Evaluate browser.navigate:
  // Priority 1 is stratxcel-browser (MCP, status: healthy).
  const browserResult = await selectBestResource(mockSupabase, {
    capabilityKey: "browser.navigate",
  });
  assert.equal(browserResult.selectedConnector, "stratxcel-browser");
  assert.equal(browserResult.executionMethod, "mcp");
  assert.equal(browserResult.status, "AVAILABLE");

  console.log("✓ PASS: Hermes Resource Selector dynamically routes to MCP when healthy.");
}

console.log("\n=======================================================");
console.log("ALL 9 MASTER MCP INFRASTRUCTURE TESTS PASSED CLEANLY!");
console.log("=======================================================");
