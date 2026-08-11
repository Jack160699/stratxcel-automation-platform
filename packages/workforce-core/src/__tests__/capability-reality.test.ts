// Run with: node --experimental-strip-types packages/workforce-core/src/__tests__/capability-reality.test.ts
import assert from "node:assert/strict";
import {
  CAPABILITY_KEYS,
  isNonExecutableStatus,
} from "../capabilities/types.ts";
import {
  assertCapability,
  assertRegistryIntegrity,
  countCapabilitiesByStatus,
  getCapability,
  isCapabilityAvailable,
  isCapabilityUnavailable,
  listCapabilities,
  validateCapabilityDefinition,
} from "../capabilities/registry.ts";
import {
  listExecutableCapabilityKeys,
  resolveCapabilityReadiness,
  revalidateCapabilityForExecution,
} from "../capabilities/readiness.ts";
import { requestCapability } from "../capabilities/execution.ts";
import {
  buildCapabilityPlannerSnapshot,
  buildStaticCapabilityPlannerSnapshot,
} from "../capabilities/snapshot.ts";
import { listCapabilityToolMappings } from "../capabilities/tool-mapping.ts";
import { createCapabilityProvenance } from "../artifacts/provenance.ts";
import {
  assertCapabilitiesExecutable,
  isBlockedCapability,
  narrowCapabilityClasses,
  CapabilityEscalationError,
} from "../security/narrowing.ts";
import {
  registerProvider,
  resetProviderRegistryForTests,
  listProvidersForCapability,
} from "../providers/registry.ts";
import { executeWithFailover } from "../providers/failover.ts";
import { resetAndBootstrapProvidersForTests } from "../providers/bootstrap.ts";
import type { CapabilityProvider, ProviderExecuteResult } from "../providers/types.ts";
import { unknownCostUsage } from "../providers/types.ts";

function run() {
  // --- Registry integrity / explicit status ---
  assertRegistryIntegrity();
  assert.equal(listCapabilities().length, CAPABILITY_KEYS.length);
  for (const def of listCapabilities()) {
    assert.ok(def.status, `explicit status required: ${def.key}`);
    const errors = validateCapabilityDefinition(def);
    assert.equal(errors.length, 0, errors.join(","));
    if (def.externalMutation) {
      assert.equal(def.approvalRequired, true, `mutation requires approval: ${def.key}`);
    }
  }

  const counts = countCapabilitiesByStatus();
  assert.equal(counts.AVAILABLE, 7);
  assert.equal(counts.NOT_CONFIGURED, 5);
  assert.equal(counts.UNAVAILABLE, 1);
  assert.equal(counts.PLANNED, CAPABILITY_KEYS.length - 7 - 5 - 1);

  assert.equal(getCapability("content.shortform")?.status, "AVAILABLE");
  assert.equal(getCapability("social.schedule")?.status, "AVAILABLE");
  assert.equal(getCapability("social.publish")?.status, "AVAILABLE");
  assert.equal(getCapability("seo.audit")?.status, "AVAILABLE");
  assert.equal(getCapability("website.generate")?.status, "AVAILABLE");
  assert.equal(getCapability("crm.read")?.status, "AVAILABLE");
  assert.equal(getCapability("crm.write")?.status, "AVAILABLE");

  assert.equal(getCapability("media.image_generation")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("seo.publish")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("whatsapp.send")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("analytics.read")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("content.publish")?.status, "NOT_CONFIGURED");

  assert.equal(getCapability("media.video_generation")?.status, "UNAVAILABLE");
  assert.equal(getCapability("media.carousel_generation")?.status, "PLANNED");
  assert.equal(getCapability("content.longform")?.status, "PLANNED");
  assert.equal(getCapability("website.deploy")?.status, "PLANNED");
  assert.equal(getCapability("ads.publish")?.status, "PLANNED");
  assert.equal(getCapability("research.web")?.status, "PLANNED");

  assert.equal(getCapability("social.publish")?.requiredEntitlementClass, "social_posts");
  assert.equal(getCapability("ads.plan")?.requiredEntitlementClass, "meta_ad_campaigns");
  assert.equal(getCapability("whatsapp.send")?.requiredEntitlementClass, "whatsapp_contacts");
  assert.equal(getCapability("website.generate")?.requiredEntitlementClass, "website_maintenance");
  assert.equal(getCapability("website.deploy")?.requiredEntitlementClass, "website_maintenance");

  assert.throws(() => assertCapability("not.a.capability"), /unknown_capability/);
  assert.equal(isCapabilityAvailable("content.shortform"), true);
  assert.equal(isCapabilityUnavailable("media.image_generation"), true);
  assert.equal(isCapabilityUnavailable("media.carousel_generation"), true);
  assert.equal(isCapabilityUnavailable("media.video_generation"), true);
  assert.ok(isNonExecutableStatus("PLANNED"));
  assert.ok(isBlockedCapability("media.carousel_generation"));
  assert.ok(isBlockedCapability("media.image_generation"));
  assert.throws(
    () => assertCapabilitiesExecutable(["research.web"]),
    (err: unknown) =>
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "capability_unavailable",
  );

  // --- Tool mapping completeness ---
  assert.equal(listCapabilityToolMappings().length, CAPABILITY_KEYS.length);

  // --- Media truth: never executable without real provider ---
  const imageReady = resolveCapabilityReadiness({
    capabilityKey: "media.image_generation",
    trustedTenantId: "tenant-a",
    requestedOperation: "execute",
  });
  assert.equal(imageReady.executable, false);
  assert.equal(imageReady.reasonCode, "PROVIDER_NOT_CONFIGURED");

  const carouselReady = resolveCapabilityReadiness({
    capabilityKey: "media.carousel_generation",
    trustedTenantId: "tenant-a",
  });
  assert.equal(carouselReady.executable, false);
  assert.equal(carouselReady.reasonCode, "IMPLEMENTATION_PLANNED");

  const videoReady = resolveCapabilityReadiness({
    capabilityKey: "media.video_generation",
    trustedTenantId: "tenant-a",
  });
  assert.equal(videoReady.executable, false);
  assert.equal(videoReady.reasonCode, "IMPLEMENTATION_UNAVAILABLE");

  // --- Tenant isolation ---
  const socialNeeds = {
    capabilityKey: "social.publish",
    trustedTenantId: "tenant-a",
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { social_posts: 10 },
      remaining: { social_posts: 5 },
    },
    integrationSnapshot: {
      tenantId: "tenant-a",
      connected: ["social_account"],
    },
    authorization: { approvalGranted: true, shadowMode: false },
    requestedOperation: "execute" as const,
    requiredInputArtifactsPresent: true,
  };

  assert.equal(resolveCapabilityReadiness(socialNeeds).executable, true);

  const crossEntitlement = resolveCapabilityReadiness({
    ...socialNeeds,
    entitlementSnapshot: {
      tenantId: "tenant-b",
      metrics: { social_posts: 99 },
      remaining: { social_posts: 99 },
    },
  });
  assert.equal(crossEntitlement.executable, false);
  assert.equal(crossEntitlement.reasonCode, "ENTITLEMENT_MISSING");

  const crossIntegration = resolveCapabilityReadiness({
    ...socialNeeds,
    integrationSnapshot: {
      tenantId: "tenant-b",
      connected: ["social_account"],
    },
  });
  assert.equal(crossIntegration.executable, false);

  const missingTenant = resolveCapabilityReadiness({
    capabilityKey: "crm.read",
    trustedTenantId: null,
  });
  assert.equal(missingTenant.executable, false);
  assert.equal(missingTenant.reasonCode, "TENANT_BINDING_MISSING");

  // --- Authorization / shadow / kill switch / planner ---
  assert.equal(
    resolveCapabilityReadiness({
      ...socialNeeds,
      authorization: { approvalGranted: false, shadowMode: false },
    }).reasonCode,
    "APPROVAL_REQUIRED",
  );
  assert.equal(
    resolveCapabilityReadiness({
      ...socialNeeds,
      authorization: { approvalGranted: true, shadowMode: true },
    }).reasonCode,
    "SHADOW_BLOCKED",
  );
  assert.equal(
    resolveCapabilityReadiness({
      ...socialNeeds,
      authorization: { approvalGranted: true, shadowMode: false, killSwitchActive: true },
    }).reasonCode,
    "KILL_SWITCH_ACTIVE",
  );
  assert.equal(
    resolveCapabilityReadiness({
      ...socialNeeds,
      fromPlannerSnapshot: true,
    }).executable,
    false,
  );

  const exhausted = resolveCapabilityReadiness({
    ...socialNeeds,
    entitlementSnapshot: {
      tenantId: "tenant-a",
      metrics: { social_posts: 10 },
      remaining: { social_posts: 0 },
    },
  });
  assert.equal(exhausted.reasonCode, "ENTITLEMENT_EXHAUSTED");

  const parentCaps = ["content.shortform", "research.web"];
  assert.throws(
    () => narrowCapabilityClasses(parentCaps, ["social.publish"]),
    CapabilityEscalationError,
  );

  // --- Snapshots never authorize ---
  const staticSnap = buildStaticCapabilityPlannerSnapshot();
  assert.ok(staticSnap.plannedKeys.includes("research.web"));
  assert.ok(staticSnap.setupRequiredKeys.includes("media.image_generation"));
  assert.ok(staticSnap.unavailableKeys.includes("media.video_generation"));
  assert.ok(!staticSnap.availableKeys.includes("media.image_generation"));

  const tenantSnap = buildCapabilityPlannerSnapshot({
    trustedTenantId: "tenant-a",
    entitlementSnapshot: socialNeeds.entitlementSnapshot,
    integrationSnapshot: socialNeeds.integrationSnapshot,
    authorization: socialNeeds.authorization,
  });
  assert.ok(tenantSnap.entries.length === CAPABILITY_KEYS.length);

  const revalidated = revalidateCapabilityForExecution({
    capabilityKey: "social.publish",
    trustedTenantId: "tenant-a",
    entitlementSnapshot: socialNeeds.entitlementSnapshot,
    integrationSnapshot: socialNeeds.integrationSnapshot,
    authorization: socialNeeds.authorization,
    requiredInputArtifactsPresent: true,
  });
  assert.equal(revalidated.executable, true);

  // --- requestCapability public API ---
  return (async () => {
    resetAndBootstrapProvidersForTests();

    const blockedPlan = await requestCapability({
      requestId: "req-plan",
      missionId: "mission-1",
      tenantId: "tenant-a",
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["art-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: {
        trustedTenantId: "tenant-a",
        fromPlannerSnapshot: true,
        approvalGranted: true,
      },
    });
    assert.equal(blockedPlan.status, "BLOCKED");
    assert.equal(blockedPlan.reasonCode, "POLICY_BLOCK");
    assert.equal(blockedPlan.outputArtifactIds.length, 0);

    const forgedTenant = await requestCapability({
      requestId: "req-forge",
      missionId: "mission-1",
      tenantId: "tenant-evil",
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["art-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: {
        trustedTenantId: "tenant-a",
        approvalGranted: true,
      },
    });
    assert.equal(forgedTenant.status, "BLOCKED");
    assert.equal(forgedTenant.reasonCode, "TENANT_BINDING_MISSING");

    const mediaBlocked = await requestCapability({
      requestId: "req-media",
      missionId: "mission-1",
      tenantId: "tenant-a",
      department: "media",
      role: "image_producer",
      capability: "media.image_generation",
      inputArtifactIds: ["brief-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: "tenant-a" },
    });
    assert.notEqual(mediaBlocked.status, "SUCCEEDED");
    assert.equal(mediaBlocked.outputArtifactIds.length, 0);

    const crmOk = await requestCapability(
      {
        requestId: "req-crm",
        missionId: "mission-1",
        tenantId: "tenant-a",
        department: "crm",
        role: "crm_analyst",
        capability: "crm.read",
        inputArtifactIds: [],
        requestedAt: new Date().toISOString(),
        authorizationContext: { trustedTenantId: "tenant-a" },
      },
      {},
    );
    assert.equal(crmOk.status, "SUCCEEDED");
    assert.ok(crmOk.outputArtifactIds.length > 0);
    assert.equal(crmOk.cost?.costKnown, false);

    const publishOk = await requestCapability(
      {
        requestId: "req-pub",
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
      },
      {
        entitlementSnapshot: socialNeeds.entitlementSnapshot,
        integrationSnapshot: socialNeeds.integrationSnapshot,
      },
    );
    assert.equal(publishOk.status, "SUCCEEDED");

    const shadow = await requestCapability(
      {
        requestId: "req-shadow",
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
          shadowMode: true,
        },
      },
      {
        entitlementSnapshot: socialNeeds.entitlementSnapshot,
        integrationSnapshot: socialNeeds.integrationSnapshot,
      },
    );
    assert.equal(shadow.status, "SHADOW_COMPLETED");
    assert.equal(shadow.outputArtifactIds.length, 0);

    // --- Provider failover ---
    resetProviderRegistryForTests();
    let calls = 0;
    const flaky: CapabilityProvider = {
      key: "failover-a",
      capabilityKeys: ["content.shortform"],
      status: "IMPLEMENTED",
      probeReadiness: () => ({ ready: true, status: "IMPLEMENTED", reasonCode: "READY" }),
      execute: async (): Promise<ProviderExecuteResult> => {
        calls += 1;
        if (calls === 1) {
          return {
            ok: false,
            providerKey: "failover-a",
            errorCategory: "TIMEOUT",
            errorMessage: "timeout",
            usage: unknownCostUsage(),
          };
        }
        return {
          ok: true,
          providerKey: "failover-a",
          outputArtifactIds: ["ok"],
          usage: unknownCostUsage({ requests: 1 }),
        };
      },
    };
    const secondary: CapabilityProvider = {
      key: "failover-b",
      capabilityKeys: ["content.shortform"],
      status: "IMPLEMENTED",
      probeReadiness: () => ({ ready: true, status: "IMPLEMENTED", reasonCode: "READY" }),
      execute: async () => ({
        ok: true,
        providerKey: "failover-b",
        outputArtifactIds: ["from-b"],
        usage: unknownCostUsage({ requests: 1 }),
      }),
    };
    registerProvider(flaky);
    registerProvider(secondary);

    const failOver = await executeWithFailover(
      "content.shortform",
      {
        requestId: "fo-1",
        tenantId: "tenant-a",
        missionId: "mission-1",
        capability: "content.shortform",
        inputArtifactIds: [],
      },
      { maxAttempts: 3, preferredProviderKeys: ["failover-a", "failover-b"] },
    );
    assert.equal(failOver.result.ok, true);
    assert.ok(failOver.providersTried.length >= 1);

    // Policy rejection must not failover
    resetProviderRegistryForTests();
    registerProvider({
      key: "policy-a",
      capabilityKeys: ["content.shortform"],
      status: "IMPLEMENTED",
      probeReadiness: () => ({ ready: true, status: "IMPLEMENTED", reasonCode: "READY" }),
      execute: async () => ({
        ok: false,
        providerKey: "policy-a",
        errorCategory: "POLICY_BLOCK",
        errorMessage: "policy",
      }),
    });
    registerProvider({
      key: "policy-b",
      capabilityKeys: ["content.shortform"],
      status: "IMPLEMENTED",
      probeReadiness: () => ({ ready: true, status: "IMPLEMENTED", reasonCode: "READY" }),
      execute: async () => ({
        ok: true,
        providerKey: "policy-b",
        outputArtifactIds: ["should-not"],
        usage: unknownCostUsage(),
      }),
    });
    const noHop = await executeWithFailover(
      "content.shortform",
      {
        requestId: "fo-policy",
        tenantId: "tenant-a",
        missionId: "mission-1",
        capability: "content.shortform",
        inputArtifactIds: [],
      },
      { preferredProviderKeys: ["policy-a", "policy-b"] },
    );
    assert.equal(noHop.result.ok, false);
    assert.equal(noHop.result.errorCategory, "POLICY_BLOCK");
    assert.deepEqual([...noHop.providersTried], ["policy-a"]);

    // Restore default providers for any subsequent imports in same process
    resetAndBootstrapProvidersForTests();
    assert.ok(listProvidersForCapability("crm.read").length >= 1);

    const executable = listExecutableCapabilityKeys({
      trustedTenantId: "tenant-a",
      entitlementSnapshot: {
        tenantId: "tenant-a",
        metrics: {
          social_posts: 10,
          website_maintenance: 1,
          meta_ad_campaigns: 1,
          whatsapp_contacts: 100,
        },
        remaining: {
          social_posts: 10,
          website_maintenance: 1,
          meta_ad_campaigns: 1,
          whatsapp_contacts: 100,
        },
      },
      integrationSnapshot: {
        tenantId: "tenant-a",
        connected: ["social_account", "media_generator", "analytics_property", "whatsapp_binding"],
      },
      authorization: { approvalGranted: true, shadowMode: false },
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    });
    assert.ok(executable.includes("crm.read"));
    assert.ok(!executable.includes("media.image_generation"));
    assert.ok(!executable.includes("media.video_generation"));

    const prov = createCapabilityProvenance({
      capabilityKey: "crm.read",
      providerKey: "crm-supabase",
      requestId: "req-crm",
      tenantId: "tenant-a",
      missionId: "mission-1",
      parentArtifactIds: [],
      usage: { requests: 1, costKnown: false },
    });
    assert.equal(prov.capabilityKey, "crm.read");
    assert.equal(prov.tenantId, "tenant-a");

    console.log("capability-reality.test.ts (@stratxcel/workforce-core): ALL PASS");
  })();
}

const maybePromise = run();
if (maybePromise && typeof (maybePromise as Promise<void>).then === "function") {
  (maybePromise as Promise<void>).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
