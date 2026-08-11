// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/capability-integration-security.test.ts
import assert from "node:assert/strict";
import {
  authorizeRevenueMutation,
  isRevenueExecutionEligible,
} from "@stratxcel/revenue-ops";
import { listProviders, resetProviderRegistryForTests, registerProvider } from "../providers/registry.ts";
import {
  bootstrapCapabilityProviders,
  resetAndBootstrapProvidersForTests,
} from "../providers/bootstrap.ts";
import { requestCapability } from "../capabilities/execution.ts";
import { resolveCapabilityReadiness } from "../capabilities/readiness.ts";
import { getCapability } from "../capabilities/registry.ts";
import {
  createSimulatedSuccessProvider,
  createTestSuccessProvider,
} from "./mocks/simulated-providers.ts";
import type { ArtifactRecord } from "../capabilities/request.ts";
import { unknownCostUsage } from "../providers/types.ts";
import type { CapabilityExecutionDeps } from "../capabilities/execution.ts";

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "sec-req-1",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "search_web",
    role: "auditor",
    capability: "website.audit",
    inputArtifactIds: [] as string[],
    requestedAt: new Date().toISOString(),
    authorizationContext: {
      trustedTenantId: "tenant-a",
    },
    input: {
      propertyUrl: "https://example.com",
      pages: [{ url: "https://example.com/", strength: "strong" as const }],
    },
    ...overrides,
  };
}

const auditPages = [
  { url: "https://example.com/", strength: "strong" as const, title: "Home" },
  { url: "https://example.com/about", strength: "weak" as const, title: "About" },
];

async function run() {
  // --- productionProviderRegistryContainsNoSimulatedSuccessProviders ---
  resetAndBootstrapProvidersForTests();
  bootstrapCapabilityProviders(); // idempotent

  for (const provider of listProviders()) {
    const probe = await provider.probeReadiness({
      tenantId: "tenant-a",
      capability: provider.capabilityKeys[0]!,
    });
    if (provider.status !== "IMPLEMENTED") {
      assert.equal(probe.ready, false, `non-implemented must not be ready: ${provider.key}`);
      const result = await provider.execute({
        requestId: "probe",
        tenantId: "tenant-a",
        missionId: "m",
        capability: provider.capabilityKeys[0]!,
        inputArtifactIds: [],
      });
      assert.equal(result.ok, false, `placeholder must fail closed: ${provider.key}`);
      assert.notEqual(
        (result.receipt as { simulated?: boolean } | undefined)?.simulated,
        true,
        `no simulated receipt: ${provider.key}`,
      );
    } else {
      assert.equal(probe.ready, true, `implemented should probe ready: ${provider.key}`);
      const result = await provider.execute({
        requestId: "probe-impl",
        tenantId: "tenant-a",
        missionId: "m",
        capability: provider.capabilityKeys[0]!,
        inputArtifactIds: [],
      });
      assert.notEqual(
        (result.receipt as { simulated?: boolean } | undefined)?.simulated,
        true,
        `implemented production provider must not mark simulated: ${provider.key}`,
      );
      // Production IMPLEMENTED providers must never return ok:true + simulated:true
      if (result.ok) {
        assert.notEqual(
          (result.receipt as { simulated?: boolean } | undefined)?.simulated,
          true,
          `no simulated success stub: ${provider.key}`,
        );
      }
    }
  }

  // Bootstrap / production registry must not include simulated stub keys
  const productionKeys = listProviders().map((p) => p.key);
  assert.ok(!productionKeys.some((k) => k.includes("simulat")), "no simulated stub keys in bootstrap");
  assert.ok(productionKeys.includes("website-audit-internal"));
  assert.ok(productionKeys.includes("social-publish-meta"));
  assert.equal(getCapability("social.publish")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("website.audit")?.status, "AVAILABLE");

  // --- requestCapabilityCannotReturnSucceededFromSimulatedRuntimeProvider ---
  resetAndBootstrapProvidersForTests();
  const unwired = await requestCapability({
    requestId: "social-unwired",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "social",
    role: "publisher",
    capability: "social.publish",
    inputArtifactIds: ["social-final-1"],
    requestedAt: new Date().toISOString(),
    authorizationContext: {
      trustedTenantId: "tenant-a",
      approvalGranted: true,
      shadowMode: false,
    },
  }, {
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { social_posts: 10 },
      remaining: { social_posts: 5 },
    },
    integrationSnapshot: {
      tenantId: "tenant-a",
      connected: ["social_account"],
    },
    environment: { featureFlags: { social_publishing: true } },
  });
  assert.notEqual(unwired.status, "SUCCEEDED");
  assert.equal(unwired.status, "WAITING_CONFIGURATION");
  assert.equal(unwired.reasonCode, "PROVIDER_NOT_CONFIGURED");
  assert.equal(
    (unwired.receipt as { simulated?: boolean } | undefined)?.simulated,
    undefined,
    "no simulated receipt on unwired path",
  );

  // Simulated:true receipts are rejected by production requestCapability
  let simulatedCalls = 0;
  const simulatedRejected = await requestCapability(
    baseRequest({
      requestId: "sim-block",
      capability: "website.audit",
      inputArtifactIds: ["snap-1"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: (id) =>
        id === "snap-1"
          ? { id, tenantId: "tenant-a", missionId: "mission-1", kind: "website_snapshot" }
          : null,
      executeProvider: async () => {
        simulatedCalls += 1;
        return {
          result: {
            ok: true,
            providerKey: "sim",
            outputArtifactIds: ["out"],
            usage: unknownCostUsage({ requests: 1 }),
            receipt: { simulated: true },
          },
          attempts: 1,
          providersTried: ["sim"],
        };
      },
    },
  );
  assert.notEqual(simulatedRejected.status, "SUCCEEDED");
  assert.equal(simulatedRejected.status, "FAILED");
  assert.equal(simulatedRejected.reasonCode, "POLICY_BLOCK");
  assert.equal(simulatedCalls, 1);

  // Register createSimulatedSuccessProvider — still cannot SUCCEED via production path
  resetProviderRegistryForTests();
  registerProvider(
    createSimulatedSuccessProvider({
      key: "sim-social-publish",
      capabilityKeys: ["social.publish"],
    }),
  );
  // social.publish remains NOT_CONFIGURED in catalogue → still waiting
  const withSimProvider = await requestCapability({
    requestId: "sim-reg",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "social",
    role: "publisher",
    capability: "social.publish",
    inputArtifactIds: ["social-final-1"],
    requestedAt: new Date().toISOString(),
    authorizationContext: {
      trustedTenantId: "tenant-a",
      approvalGranted: true,
    },
  }, {
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { social_posts: 10 },
      remaining: { social_posts: 5 },
    },
    integrationSnapshot: { tenantId: "tenant-a", connected: ["social_account"] },
    environment: { featureFlags: { social_publishing: true } },
  });
  assert.notEqual(withSimProvider.status, "SUCCEEDED");

  // Prefer: inject TEST provider (ok:true, test_receipt, no simulated:true) via executeProvider
  resetAndBootstrapProvidersForTests();
  const testInjected = await requestCapability(
    baseRequest({
      requestId: "test-ok",
      inputArtifactIds: ["snap-1"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: (id) =>
        id === "snap-1"
          ? { id, tenantId: "tenant-a", missionId: "mission-1", kind: "website_snapshot" }
          : null,
      executeProvider: async (_cap, input) => {
        const provider = createTestSuccessProvider({
          key: "test-website-audit",
          capabilityKeys: ["website.audit"],
        });
        const result = await provider.execute({
          requestId: input.requestId,
          tenantId: input.tenantId,
          missionId: input.missionId,
          capability: input.capability,
          inputArtifactIds: input.inputArtifactIds,
          input: input.input,
        });
        return { result, attempts: 1, providersTried: [provider.key] };
      },
    },
  );
  assert.equal(testInjected.status, "SUCCEEDED");
  assert.equal((testInjected.receipt as { kind?: string })?.kind, "test_receipt");
  assert.equal((testInjected.receipt as { testOnly?: boolean })?.testOnly, true);
  assert.notEqual((testInjected.receipt as { simulated?: boolean })?.simulated, true);

  // Without injection, production path still works for website.audit (real engine)
  const productionAudit = await requestCapability(
    baseRequest({
      requestId: "prod-audit",
      inputArtifactIds: ["snap-1"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: (id) =>
        id === "snap-1"
          ? { id, tenantId: "tenant-a", missionId: "mission-1", kind: "website_snapshot" }
          : null,
    },
  );
  assert.equal(productionAudit.status, "SUCCEEDED");
  assert.notEqual((productionAudit.receipt as { simulated?: boolean })?.simulated, true);

  // Prove production path for NOT_CONFIGURED capability does not SUCCEED without injection
  const noInjectPublish = await requestCapability({
    requestId: "no-inject-pub",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "social",
    role: "publisher",
    capability: "social.publish",
    inputArtifactIds: ["social-final-1"],
    requestedAt: new Date().toISOString(),
    authorizationContext: {
      trustedTenantId: "tenant-a",
      approvalGranted: true,
    },
  }, {
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { social_posts: 10 },
      remaining: { social_posts: 5 },
    },
    integrationSnapshot: { tenantId: "tenant-a", connected: ["social_account"] },
    environment: { featureFlags: { social_publishing: true } },
  });
  assert.notEqual(noInjectPublish.status, "SUCCEEDED");

  // --- unrelatedDisabledFeatureFlagDoesNotBlockCapability ---
  // seo.audit requiredFeatureFlags: ["search_web"]
  const unrelated = await requestCapability({
    requestId: "seo-unrelated-flag",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "search_web",
    role: "seo_auditor",
    capability: "seo.audit",
    inputArtifactIds: ["snap-1"],
    requestedAt: new Date().toISOString(),
    authorizationContext: { trustedTenantId: "tenant-a" },
  }, {
    environment: {
      featureFlags: {
        payments_recurring: false,
        search_web: true,
      },
    },
    artifactResolver: (id) =>
      id === "snap-1"
        ? { id, tenantId: "tenant-a", missionId: "mission-1", kind: "website_snapshot" }
        : null,
  });
  assert.notEqual(unrelated.reasonCode, "FEATURE_FLAG_DISABLED");
  assert.ok(
    unrelated.status === "WAITING_CONFIGURATION" || unrelated.status === "BLOCKED",
  );

  const unrelatedReady = resolveCapabilityReadiness({
    capabilityKey: "seo.audit",
    trustedTenantId: "tenant-a",
    environment: {
      featureFlags: {
        payments_recurring: false,
        search_web: true,
      },
    },
    requiredInputArtifactsPresent: true,
  });
  assert.notEqual(unrelatedReady.reasonCode, "FEATURE_FLAG_DISABLED");
  assert.equal(unrelatedReady.executable, false);

  // website.audit with unrelated flags must remain executable
  const websiteUnrelated = resolveCapabilityReadiness({
    capabilityKey: "website.audit",
    trustedTenantId: "tenant-a",
    environment: {
      featureFlags: {
        payments_recurring: false,
        payments_live: false,
        ads_publishing: false,
        search_web: true,
      },
    },
    requiredInputArtifactsPresent: true,
  });
  assert.equal(websiteUnrelated.executable, true);
  assert.equal(websiteUnrelated.reasonCode, "READY");

  // --- requiredDisabledFeatureFlagBlocksCapability ---
  const requiredOffSeo = await requestCapability({
    requestId: "seo-flag-off",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "search_web",
    role: "seo_auditor",
    capability: "seo.audit",
    inputArtifactIds: ["snap-1"],
    requestedAt: new Date().toISOString(),
    authorizationContext: { trustedTenantId: "tenant-a" },
  }, {
    environment: { featureFlags: { search_web: false, payments_recurring: true } },
    artifactResolver: (id) =>
      id === "snap-1"
        ? { id, tenantId: "tenant-a", missionId: "mission-1", kind: "website_snapshot" }
        : null,
  });
  assert.equal(requiredOffSeo.status, "BLOCKED");
  assert.equal(requiredOffSeo.reasonCode, "FEATURE_FLAG_DISABLED");

  const requiredOff = resolveCapabilityReadiness({
    capabilityKey: "website.audit",
    trustedTenantId: "tenant-a",
    environment: {
      featureFlags: {
        search_web: false,
        payments_live: true,
      },
    },
    requiredInputArtifactsPresent: true,
  });
  assert.equal(requiredOff.executable, false);
  assert.equal(requiredOff.reasonCode, "FEATURE_FLAG_DISABLED");

  // Artifact helpers
  const artifacts = new Map<string, ArtifactRecord>([
    [
      "ok-snap",
      {
        id: "ok-snap",
        tenantId: "tenant-a",
        missionId: "mission-1",
        kind: "website_snapshot",
        version: "3",
        status: "ready",
      },
    ],
    [
      "cross-snap",
      { id: "cross-snap", tenantId: "tenant-b", missionId: "mission-1", kind: "website_snapshot" },
    ],
    [
      "wrong-kind",
      { id: "wrong-kind", tenantId: "tenant-a", missionId: "mission-1", kind: "social_final" },
    ],
    [
      "wrong-mission",
      {
        id: "wrong-mission",
        tenantId: "tenant-a",
        missionId: "mission-OTHER",
        kind: "website_snapshot",
        version: "1",
        status: "ready",
      },
    ],
    [
      "missionless-snap",
      {
        id: "missionless-snap",
        tenantId: "tenant-a",
        // intentionally no missionId — tenant-level / missionless artifact
        kind: "website_snapshot",
        version: "1",
        status: "ready",
      },
    ],
    [
      "missionless-brand",
      {
        id: "missionless-brand",
        tenantId: "tenant-a",
        kind: "brand_brain",
        version: "1",
        status: "active",
      },
    ],
    [
      "brand-brain-shared",
      {
        id: "brand-brain-shared",
        tenantId: "tenant-a",
        missionId: "mission-FOUNDATION",
        kind: "brand_brain",
        version: "1",
        status: "active",
      },
    ],
    [
      "draft-mutation",
      {
        id: "draft-mutation",
        tenantId: "tenant-a",
        missionId: "mission-1",
        kind: "social_final",
        version: "1",
        status: "draft",
      },
    ],
    [
      "approved-social",
      {
        id: "approved-social",
        tenantId: "tenant-a",
        missionId: "mission-1",
        kind: "social_final",
        version: "3",
        status: "approved",
      },
    ],
  ]);
  const resolver = (id: string) => artifacts.get(id) ?? null;

  let providerCalls = 0;
  const countingExecute: NonNullable<CapabilityExecutionDeps["executeProvider"]> = async (
    _capability,
    input,
  ) => {
    providerCalls += 1;
    return {
      result: {
        ok: true,
        providerKey: "website-audit-internal",
        outputArtifactIds: [`artifact:website_audit:${input.requestId}`],
        usage: unknownCostUsage({ requests: 1 }),
        receipt: { kind: "website_audit_report" },
      },
      attempts: 1,
      providersTried: ["website-audit-internal"],
    };
  };

  // --- crossTenantInputArtifactBlocks ---
  providerCalls = 0;
  const cross = await requestCapability(
    baseRequest({
      requestId: "cross",
      inputArtifactIds: ["cross-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(cross.status, "BLOCKED");
  assert.equal(cross.reasonCode, "ARTIFACT_TENANT_MISMATCH");
  assert.equal(providerCalls, 0);

  // --- unknownArtifactBlocks ---
  providerCalls = 0;
  const unknown = await requestCapability(
    baseRequest({
      requestId: "unknown",
      inputArtifactIds: ["missing-id"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(unknown.status, "BLOCKED");
  assert.equal(unknown.reasonCode, "ARTIFACT_UNKNOWN");
  assert.equal(providerCalls, 0);

  // --- wrongArtifactKindBlocks ---
  providerCalls = 0;
  const wrongKind = await requestCapability(
    baseRequest({
      requestId: "wrong-kind",
      inputArtifactIds: ["wrong-kind"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(wrongKind.status, "BLOCKED");
  assert.equal(wrongKind.reasonCode, "ARTIFACT_KIND_UNSUPPORTED");
  assert.equal(providerCalls, 0);

  // --- validTenantArtifactPasses ---
  providerCalls = 0;
  const valid = await requestCapability(
    baseRequest({
      requestId: "valid",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(valid.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);

  // --- zeroExhaustedBudgetDoesNotExecuteProvider ---
  providerCalls = 0;
  const exhausted = await requestCapability(
    baseRequest({
      requestId: "budget-0",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
      budgetEnvelope: { remainingCents: 0, remaining: 0 },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(exhausted.status, "BLOCKED");
  assert.equal(exhausted.reasonCode, "BUDGET_EXHAUSTED");
  assert.equal(providerCalls, 0);

  const overspend = await requestCapability(
    baseRequest({
      requestId: "budget-over",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
      budgetEnvelope: { remainingCents: 100, remaining: 100, estimatedMaxCostCents: 500 },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(overspend.status, "BLOCKED");
  assert.equal(overspend.reasonCode, "BUDGET_EXHAUSTED");

  providerCalls = 0;
  const unknownCost = await requestCapability(
    baseRequest({
      requestId: "budget-unknown",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
      budgetEnvelope: { remainingCents: 100, remaining: 100 },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(unknownCost.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);

  // --- plannerSnapshotCannotAuthorizeExecution ---
  const fromPlanner = await requestCapability(
    baseRequest({
      requestId: "planner-snap",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
      authorizationContext: {
        trustedTenantId: "tenant-a",
        fromPlannerSnapshot: true,
        approvalGranted: true,
      },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(fromPlanner.status, "BLOCKED");
  assert.equal(fromPlanner.reasonCode, "POLICY_BLOCK");
  assert.match(fromPlanner.humanReason ?? "", /[Pp]lanner/);

  const plannerReady = resolveCapabilityReadiness({
    capabilityKey: "website.audit",
    trustedTenantId: "tenant-a",
    environment: { featureFlags: { search_web: true } },
    fromPlannerSnapshot: true,
    requestedOperation: "execute",
    requiredInputArtifactsPresent: true,
  });
  assert.equal(plannerReady.executable, false);
  assert.equal(plannerReady.reasonCode, "POLICY_BLOCK");

  // --- revenueDomainApprovalAloneCannotBypassCapabilityGate ---
  assert.equal(getCapability("whatsapp.send")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("crm.write")?.status, "NOT_CONFIGURED");

  const revenueGate = authorizeRevenueMutation({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-a",
    kind: "whatsapp.send",
    approvalStatus: "APPROVED",
    standingAuthorization: true,
    standingAuthorizationKind: "whatsapp.send",
    optedOut: false,
    conversationAutomationMode: "automated",
    isHumanInitiated: false,
    outsideSessionWindow: false,
    hasMarketingConsent: true,
  });
  assert.equal(revenueGate.allowed, true);

  const whatsappReady = resolveCapabilityReadiness({
    capabilityKey: "whatsapp.send",
    trustedTenantId: "tenant-a",
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { whatsapp_contacts: 100 },
      remaining: { whatsapp_contacts: 50 },
    },
    integrationSnapshot: {
      tenantId: "tenant-a",
      connected: ["whatsapp_binding"],
    },
    authorization: { approvalGranted: true, shadowMode: false },
    requiredInputArtifactsPresent: true,
  });
  assert.equal(whatsappReady.executable, false);
  assert.equal(
    isRevenueExecutionEligible({
      revenueGate,
      capabilityExecutable: whatsappReady.executable,
    }),
    false,
    "revenue allowed + capabilityExecutable false → overall false",
  );

  const whatsappReq = await requestCapability({
    requestId: "wa-bypass",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "whatsapp",
    role: "sender",
    capability: "whatsapp.send",
    inputArtifactIds: ["whatsapp_message_draft", "consent_record"],
    requestedAt: new Date().toISOString(),
    authorizationContext: {
      trustedTenantId: "tenant-a",
      approvalGranted: true,
      standingAuthorizationGranted: true,
    },
  }, {
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { whatsapp_contacts: 100 },
      remaining: { whatsapp_contacts: 50 },
    },
    integrationSnapshot: {
      tenantId: "tenant-a",
      connected: ["whatsapp_binding"],
    },
  });
  assert.notEqual(whatsappReq.status, "SUCCEEDED");
  assert.equal(whatsappReq.reasonCode, "PROVIDER_NOT_CONFIGURED");

  const revenueBypass = await requestCapability({
    requestId: "revenue-bypass",
    missionId: "mission-1",
    tenantId: "tenant-a",
    department: "revenue",
    role: "approver",
    capability: "crm.write",
    inputArtifactIds: ["crm_mutation_request"],
    requestedAt: new Date().toISOString(),
    authorizationContext: {
      trustedTenantId: "tenant-a",
      approvalGranted: true,
      standingAuthorizationGranted: true,
    },
  });
  assert.notEqual(revenueBypass.status, "SUCCEEDED");
  assert.ok(
    revenueBypass.status === "WAITING_CONFIGURATION" || revenueBypass.status === "BLOCKED",
  );
  assert.ok(
    revenueBypass.reasonCode === "PROVIDER_NOT_CONFIGURED" ||
      revenueBypass.reasonCode === "FEATURE_FLAG_DISABLED",
  );

  // --- same-tenant wrong-mission artifact blocks ---
  providerCalls = 0;
  const wrongMission = await requestCapability(
    baseRequest({
      requestId: "wrong-mission",
      inputArtifactIds: ["wrong-mission"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(wrongMission.status, "BLOCKED");
  assert.equal(wrongMission.reasonCode, "ARTIFACT_MISSION_MISMATCH");
  assert.equal(providerCalls, 0);

  // --- missionless artifact (missing missionId) defaults to BLOCK without policy ---
  providerCalls = 0;
  const missionlessBlocked = await requestCapability(
    baseRequest({
      requestId: "missionless-block",
      inputArtifactIds: ["missionless-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(missionlessBlocked.status, "BLOCKED");
  assert.equal(missionlessBlocked.reasonCode, "ARTIFACT_MISSION_MISMATCH");
  assert.equal(providerCalls, 0);

  // --- missionless + explicitly authorizedArtifactIds may pass ---
  providerCalls = 0;
  const missionlessById = await requestCapability(
    baseRequest({
      requestId: "missionless-by-id",
      inputArtifactIds: ["missionless-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      artifactUsagePolicy: { authorizedArtifactIds: ["missionless-snap"] },
      executeProvider: countingExecute,
    },
  );
  assert.equal(missionlessById.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);

  // --- missionless + allowed reusable kind passes only when capability accepts kind ---
  providerCalls = 0;
  const missionlessByKind = await requestCapability(
    baseRequest({
      requestId: "missionless-by-kind",
      inputArtifactIds: ["missionless-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      artifactUsagePolicy: { allowReusableTenantKinds: ["website_snapshot"] },
      executeProvider: countingExecute,
    },
  );
  assert.equal(missionlessByKind.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);

  providerCalls = 0;
  const missionlessKindUnsupported = await requestCapability(
    baseRequest({
      requestId: "missionless-kind-bad",
      inputArtifactIds: ["missionless-brand"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      artifactUsagePolicy: { allowReusableTenantKinds: ["brand_brain"] },
      executeProvider: countingExecute,
    },
  );
  assert.equal(missionlessKindUnsupported.status, "BLOCKED");
  assert.equal(missionlessKindUnsupported.reasonCode, "ARTIFACT_KIND_UNSUPPORTED");
  assert.equal(providerCalls, 0);

  // --- wrong tenant still blocks regardless of reuse policy ---
  providerCalls = 0;
  const wrongTenantReuse = await requestCapability(
    baseRequest({
      requestId: "wrong-tenant-reuse",
      inputArtifactIds: ["cross-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      artifactUsagePolicy: {
        authorizedArtifactIds: ["cross-snap"],
        allowReusableTenantKinds: ["website_snapshot"],
      },
      executeProvider: countingExecute,
    },
  );
  assert.equal(wrongTenantReuse.status, "BLOCKED");
  assert.equal(wrongTenantReuse.reasonCode, "ARTIFACT_TENANT_MISMATCH");
  assert.equal(providerCalls, 0);

  // --- wrong artifact version blocks ---
  providerCalls = 0;
  const wrongVersion = await requestCapability(
    baseRequest({
      requestId: "wrong-ver",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
      expectedArtifactVersions: { "ok-snap": "2" },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(wrongVersion.status, "BLOCKED");
  assert.equal(wrongVersion.reasonCode, "ARTIFACT_VERSION_MISMATCH");
  assert.equal(providerCalls, 0);

  // --- matching expected version passes ---
  providerCalls = 0;
  const versionOk = await requestCapability(
    baseRequest({
      requestId: "ver-ok",
      inputArtifactIds: ["ok-snap"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
      expectedArtifactVersions: { "ok-snap": "3" },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      executeProvider: countingExecute,
    },
  );
  assert.equal(versionOk.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);

  // --- explicitly trusted reusable tenant artifact can pass (cross-mission) ---
  // website.audit only accepts website_snapshot — use policy authorizedArtifactIds on wrong-mission snap
  providerCalls = 0;
  const trustedReuse = await requestCapability(
    baseRequest({
      requestId: "trusted-reuse",
      inputArtifactIds: ["wrong-mission"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      artifactUsagePolicy: {
        authorizedArtifactIds: ["wrong-mission"],
      },
      executeProvider: countingExecute,
    },
  );
  assert.equal(trustedReuse.status, "SUCCEEDED");
  assert.equal(providerCalls, 1);

  // Reusable kind policy — brand_brain kind not supported by website.audit → still kind block
  providerCalls = 0;
  const reusableKindWrongCap = await requestCapability(
    baseRequest({
      requestId: "reuse-kind",
      inputArtifactIds: ["brand-brain-shared"],
      input: { propertyUrl: "https://example.com", pages: auditPages },
    }),
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: resolver,
      artifactUsagePolicy: { allowReusableTenantKinds: ["brand_brain"] },
      executeProvider: countingExecute,
    },
  );
  assert.equal(reusableKindWrongCap.status, "BLOCKED");
  assert.equal(reusableKindWrongCap.reasonCode, "ARTIFACT_KIND_UNSUPPORTED");
  assert.equal(providerCalls, 0);

  // --- invalid artifact status blocks when capability requires final status ---
  const { authorizeArtifactForCapability } = await import("../capabilities/artifact-authorization.ts");
  const { getCapability: getCap } = await import("../capabilities/registry.ts");
  const socialDef = getCap("social.publish")!;
  assert.equal(socialDef.externalMutation, true);
  const draftBlocked = authorizeArtifactForCapability({
    artifact: artifacts.get("draft-mutation")!,
    requestMissionId: "mission-1",
    requestTenantId: "tenant-a",
    capability: socialDef,
  });
  assert.equal(draftBlocked.ok, false);
  assert.equal(draftBlocked.reasonCode, "ARTIFACT_STATUS_INVALID");

  const approvedOk = authorizeArtifactForCapability({
    artifact: artifacts.get("approved-social")!,
    requestMissionId: "mission-1",
    requestTenantId: "tenant-a",
    capability: socialDef,
    expectedArtifactVersions: { "approved-social": "3" },
  });
  assert.equal(approvedOk.ok, true);

  const supersededBlocked = authorizeArtifactForCapability({
    artifact: {
      id: "sup",
      tenantId: "tenant-a",
      missionId: "mission-1",
      kind: "social_final",
      version: "1",
      status: "superseded",
    },
    requestMissionId: "mission-1",
    requestTenantId: "tenant-a",
    capability: socialDef,
  });
  assert.equal(supersededBlocked.ok, false);
  assert.equal(supersededBlocked.reasonCode, "ARTIFACT_STATUS_INVALID");

  // Read-only audit may accept snapshot without final mutation status
  const auditDef = getCap("website.audit")!;
  const draftAuditOk = authorizeArtifactForCapability({
    artifact: {
      id: "draft-snap",
      tenantId: "tenant-a",
      missionId: "mission-1",
      kind: "website_snapshot",
      status: "draft",
    },
    requestMissionId: "mission-1",
    requestTenantId: "tenant-a",
    capability: auditDef,
  });
  assert.equal(draftAuditOk.ok, true);

  // --- standing auth for one capability cannot authorize another ---
  const { standingAuthorizationMatchesCapability } = await import("../capabilities/readiness.ts");
  assert.equal(
    standingAuthorizationMatchesCapability(
      {
        standingAuthorizationGranted: true,
        authorizationCapability: "social.publish",
        authorizationKind: "PACKAGE_AUTO_PUBLISH",
      },
      "social.publish",
    ),
    true,
  );
  assert.equal(
    standingAuthorizationMatchesCapability(
      {
        standingAuthorizationGranted: true,
        authorizationCapability: "social.publish",
        authorizationKind: "PACKAGE_AUTO_PUBLISH",
      },
      "whatsapp.send",
    ),
    false,
    "standing auth for social.publish must not cover whatsapp.send",
  );
  assert.equal(
    standingAuthorizationMatchesCapability(
      { standingAuthorizationGranted: true },
      "social.publish",
    ),
    false,
    "bare standingAuthorizationGranted without capability scope must not authorize",
  );

  // Readiness: bare standing auth does not satisfy approval for mutation caps
  // (crm.write is NOT_CONFIGURED so fails earlier — still prove scoped mismatch reason when status allows).
  // Use resolve with standing for wrong capability on a path that reaches approval:
  // Inject environment so we can observe STANDING_AUTH_REQUIRED via direct helper contract above.

  // Restore production bootstrap
  resetAndBootstrapProvidersForTests();

  console.log("capability-integration-security.test.ts (@stratxcel/workforce-core): ALL PASS");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
