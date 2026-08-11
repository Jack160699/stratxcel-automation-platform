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
import { resetCapabilityHostForTests } from "../adapters/host.ts";

function run() {
  resetCapabilityHostForTests();
  resetAndBootstrapProvidersForTests();

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
  // website.audit + current image runtime + seven newly wired capabilities.
  // analytics.read is truthfully downgraded because its real metric readers are not wired yet.
  assert.equal(counts.AVAILABLE, 9);
  assert.equal(counts.UNAVAILABLE, 2); // video + carousel
  assert.equal(counts.NOT_CONFIGURED, 4);
  assert.equal(
    counts.AVAILABLE + counts.NOT_CONFIGURED + counts.PLANNED + counts.UNAVAILABLE,
    CAPABILITY_KEYS.length,
  );

  assert.equal(getCapability("content.shortform")?.status, "NOT_CONFIGURED");
  assert.ok(
    (getCapability("content.shortform")?.implementationPath ?? "").includes(
      "PENDING_AI_RUNTIME_PR_45",
    ),
  );
  assert.equal(getCapability("social.schedule")?.status, "AVAILABLE");
  assert.equal(getCapability("social.publish")?.status, "AVAILABLE");
  assert.equal(getCapability("seo.audit")?.status, "AVAILABLE");
  assert.equal(getCapability("website.generate")?.status, "AVAILABLE");
  assert.equal(getCapability("crm.read")?.status, "AVAILABLE");
  assert.equal(getCapability("crm.write")?.status, "AVAILABLE");
  assert.equal(getCapability("whatsapp.send")?.status, "AVAILABLE");
  assert.equal(getCapability("analytics.read")?.status, "NOT_CONFIGURED");
  assert.deepEqual(getCapability("analytics.read")?.providerKeys, ["analytics-read-reporting"]);
  assert.equal(getCapability("social.schedule")?.approvalRequired, true);
  assert.equal(getCapability("website.audit")?.status, "AVAILABLE");
  assert.equal(getCapability("website.audit")?.requiredEntitlementClass, null);
  assert.equal(getCapability("website.generate")?.requiredEntitlementClass, "website_maintenance");

  assert.equal(getCapability("media.image_generation")?.status, "AVAILABLE");
  assert.equal(getCapability("seo.publish")?.status, "NOT_CONFIGURED");
  assert.equal(getCapability("content.publish")?.status, "NOT_CONFIGURED");

  assert.equal(getCapability("media.video_generation")?.status, "UNAVAILABLE");
  assert.equal(getCapability("media.carousel_generation")?.status, "UNAVAILABLE");
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
  assert.equal(isCapabilityAvailable("website.audit"), true);
  assert.equal(isCapabilityAvailable("seo.audit"), true);
  assert.equal(isCapabilityAvailable("content.shortform"), false);
  assert.equal(isCapabilityUnavailable("media.image_generation"), false);
  assert.equal(isCapabilityUnavailable("media.carousel_generation"), true);
  assert.equal(isCapabilityUnavailable("media.video_generation"), true);
  assert.ok(isNonExecutableStatus("PLANNED"));
  assert.ok(isBlockedCapability("media.carousel_generation"));
  assert.equal(isBlockedCapability("media.image_generation"), false);
  assert.throws(
    () => assertCapabilitiesExecutable(["research.web"]),
    (err: unknown) =>
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "capability_unavailable",
  );

  // --- Tool mapping completeness ---
  assert.equal(listCapabilityToolMappings().length, CAPABILITY_KEYS.length);

  // --- Media implementation is executable in policy; provider probe still fails closed at request time. ---
  const imageReady = resolveCapabilityReadiness({
    capabilityKey: "media.image_generation",
    trustedTenantId: "tenant-a",
    requestedOperation: "execute",
  });
  assert.equal(imageReady.executable, true);
  assert.equal(imageReady.reasonCode, "READY");

  const carouselReady = resolveCapabilityReadiness({
    capabilityKey: "media.carousel_generation",
    trustedTenantId: "tenant-a",
  });
  assert.equal(carouselReady.executable, false);
  assert.equal(carouselReady.reasonCode, "IMPLEMENTATION_UNAVAILABLE");

  const videoReady = resolveCapabilityReadiness({
    capabilityKey: "media.video_generation",
    trustedTenantId: "tenant-a",
  });
  assert.equal(videoReady.executable, false);
  assert.equal(videoReady.reasonCode, "IMPLEMENTATION_UNAVAILABLE");

  // Still-NOT_CONFIGURED catalogue entries wait configuration
  for (const key of ["content.shortform"] as const) {
    const ready = resolveCapabilityReadiness({
      capabilityKey: key,
      trustedTenantId: "tenant-a",
      entitlementSnapshot: {
        tenantId: "tenant-a",
        metrics: { social_posts: 10, website_maintenance: 1 },
        remaining: { social_posts: 5, website_maintenance: 1 },
      },
      integrationSnapshot: { tenantId: "tenant-a", connected: ["social_account"] },
      authorization: { approvalGranted: true, shadowMode: false },
      requiredInputArtifactsPresent: true,
    });
    assert.equal(ready.executable, false, `${key} must not be executable`);
    assert.equal(ready.reasonCode, "PROVIDER_NOT_CONFIGURED", `${key} reason`);
    assert.equal(ready.readiness, "WAITING_CONFIGURATION", `${key} readiness`);
  }

  // --- website.audit readiness (truthful AVAILABLE + internal provider) ---
  const auditNeeds = {
    capabilityKey: "website.audit",
    trustedTenantId: "tenant-a",
    environment: { featureFlags: { search_web: true } },
    authorization: { approvalGranted: true, shadowMode: false },
    requestedOperation: "execute" as const,
    requiredInputArtifactsPresent: true,
  };
  assert.equal(resolveCapabilityReadiness(auditNeeds).executable, true);

  // seo.audit / website.generate readiness executable
  assert.equal(
    resolveCapabilityReadiness({
      capabilityKey: "seo.audit",
      trustedTenantId: "tenant-a",
      environment: { featureFlags: { search_web: true } },
      authorization: { approvalGranted: true, shadowMode: false },
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    }).executable,
    true,
  );
  assert.equal(
    resolveCapabilityReadiness({
      capabilityKey: "website.generate",
      trustedTenantId: "tenant-a",
      entitlementSnapshot: {
        tenantId: "tenant-a",
        metrics: { website_maintenance: 1 },
        remaining: { website_maintenance: 1 },
      },
      environment: { featureFlags: { website_generate: true } },
      authorization: { approvalGranted: true, shadowMode: false },
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    }).executable,
    true,
  );

  // --- social.publish readiness READY when AVAILABLE + gates satisfied ---
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

  const socialReady = resolveCapabilityReadiness(socialNeeds);
  assert.equal(socialReady.executable, true);
  assert.equal(socialReady.readiness, "READY");
  assert.equal(socialReady.reasonCode, "READY");

  const missingTenant = resolveCapabilityReadiness({
    capabilityKey: "website.audit",
    trustedTenantId: null,
    environment: { featureFlags: { search_web: true } },
  });
  assert.equal(missingTenant.executable, false);
  assert.equal(missingTenant.reasonCode, "TENANT_BINDING_MISSING");

  // Feature-flag specificity: payments off must not block website.audit
  assert.equal(
    resolveCapabilityReadiness({
      ...auditNeeds,
      environment: { featureFlags: { payments_live: false, search_web: true } },
    }).executable,
    true,
  );

  // --- Authorization / shadow / kill switch still evaluated when AVAILABLE ---
  assert.equal(
    resolveCapabilityReadiness({
      ...auditNeeds,
      authorization: { killSwitchActive: true },
    }).reasonCode,
    "KILL_SWITCH_ACTIVE",
  );
  assert.equal(
    resolveCapabilityReadiness({
      ...auditNeeds,
      fromPlannerSnapshot: true,
    }).executable,
    false,
  );

  const parentCaps = ["content.shortform", "research.web"];
  assert.throws(
    () => narrowCapabilityClasses(parentCaps, ["social.publish"]),
    CapabilityEscalationError,
  );

  // --- Snapshots never authorize ---
  const staticSnap = buildStaticCapabilityPlannerSnapshot();
  assert.ok(staticSnap.plannedKeys.includes("research.web"));
  assert.ok(!staticSnap.setupRequiredKeys.includes("media.image_generation"));
  assert.ok(staticSnap.unavailableKeys.includes("media.video_generation"));
  assert.ok(staticSnap.unavailableKeys.includes("media.carousel_generation"));
  assert.ok(staticSnap.availableKeys.includes("media.image_generation"));
  assert.ok(staticSnap.availableKeys.includes("website.audit"));
  assert.ok(staticSnap.availableKeys.includes("social.publish"));

  const tenantSnap = buildCapabilityPlannerSnapshot({
    trustedTenantId: "tenant-a",
    entitlementSnapshot: socialNeeds.entitlementSnapshot,
    integrationSnapshot: socialNeeds.integrationSnapshot,
    authorization: socialNeeds.authorization,
    environment: { featureFlags: { search_web: true } },
  });
  assert.ok(tenantSnap.entries.length === CAPABILITY_KEYS.length);

  const revalidated = revalidateCapabilityForExecution({
    capabilityKey: "website.audit",
    trustedTenantId: "tenant-a",
    environment: { featureFlags: { search_web: true } },
    authorization: { approvalGranted: true },
    requiredInputArtifactsPresent: true,
  });
  assert.equal(revalidated.executable, true);

  // --- requestCapability public API ---
  return (async () => {
    resetCapabilityHostForTests();
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

    // CRM AVAILABLE but unbound service client → WAITING_CONFIGURATION
    const crmBlocked = await requestCapability(
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
    assert.equal(crmBlocked.status, "WAITING_CONFIGURATION");
    assert.equal(crmBlocked.reasonCode, "PROVIDER_NOT_CONFIGURED");
    assert.equal(crmBlocked.outputArtifactIds.length, 0);

    // social.publish without host binding → WAITING_CONFIGURATION
    const publishBlocked = await requestCapability(
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
    assert.equal(publishBlocked.status, "WAITING_CONFIGURATION");
    assert.equal(publishBlocked.reasonCode, "PROVIDER_NOT_CONFIGURED");

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

    const auditOk = await requestCapability(
      {
        requestId: "req-audit",
        missionId: "mission-1",
        tenantId: "tenant-a",
        department: "search_web",
        role: "auditor",
        capability: "website.audit",
        inputArtifactIds: ["website-snap-1"],
        requestedAt: new Date().toISOString(),
        authorizationContext: { trustedTenantId: "tenant-a" },
        input: {
          propertyUrl: "https://example.com",
          pages: [{ url: "https://example.com/", strength: "strong" }],
        },
      },
      {
        environment: { featureFlags: { search_web: true } },
        artifactResolver: (id) =>
          id === "website-snap-1"
            ? { id, tenantId: "tenant-a", missionId: "mission-1", kind: "website_snapshot" }
            : null,
      },
    );
    assert.equal(auditOk.status, "SUCCEEDED");
    assert.ok(auditOk.outputArtifactIds.length > 0);
    assert.notEqual((auditOk.receipt as { simulated?: boolean } | undefined)?.simulated, true);

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
    resetCapabilityHostForTests();
    resetAndBootstrapProvidersForTests();
    assert.ok(listProvidersForCapability("crm.read").length >= 1);
    assert.ok(listProvidersForCapability("website.audit").length >= 1);

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
      environment: { featureFlags: { search_web: true } },
      authorization: { approvalGranted: true, shadowMode: false },
      requestedOperation: "execute",
      requiredInputArtifactsPresent: true,
    });
    assert.ok(executable.includes("website.audit"));
    assert.ok(executable.includes("seo.audit"));
    assert.ok(executable.includes("crm.read"));
    assert.ok(executable.includes("media.image_generation"));
    assert.ok(!executable.includes("media.video_generation"));
    assert.ok(!executable.includes("content.shortform"));

    const prov = createCapabilityProvenance({
      capabilityKey: "website.audit",
      providerKey: "website-audit-internal",
      requestId: "req-audit",
      tenantId: "tenant-a",
      missionId: "mission-1",
      parentArtifactIds: [],
      usage: { requests: 1, costKnown: false },
    });
    assert.equal(prov.capabilityKey, "website.audit");
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
