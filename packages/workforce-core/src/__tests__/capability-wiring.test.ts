// node --experimental-strip-types packages/workforce-core/src/__tests__/capability-wiring.test.ts
import assert from "node:assert/strict";
import { countCapabilitiesByStatus, getCapability } from "../capabilities/registry.ts";
import { requestCapability } from "../capabilities/execution.ts";
import { resolveCapabilityReadiness } from "../capabilities/readiness.ts";
import { resetAndBootstrapProvidersForTests } from "../providers/bootstrap.ts";
import { bindCapabilityHost, resetCapabilityHostForTests } from "../adapters/host.ts";
import { getCapabilityOperationClass } from "../adapters/operation-class.ts";
import { assertSafePublicHttpUrl } from "../adapters/url-safety.ts";
import { scrubReceiptDetail } from "../adapters/receipts.ts";

const A = "tenant-a";
const B = "tenant-b";
const future = () => new Date(Date.now() + 86400000).toISOString();

async function run() {
  resetCapabilityHostForTests();
  resetAndBootstrapProvidersForTests();

  const counts = countCapabilitiesByStatus();
  assert.equal(counts.AVAILABLE, 11);
  assert.equal(counts.NOT_CONFIGURED, 4);
  assert.equal(counts.UNAVAILABLE, 2);
  assert.equal(getCapabilityOperationClass("social.publish"), "EXTERNAL_MUTATION");
  assert.throws(() => assertSafePublicHttpUrl("http://127.0.0.1/x"), /private|unsafe_url/);
  assert.equal(scrubReceiptDetail({ access_token: "x", ok: true }).access_token, undefined);
  assert.match(
    getCapability("content.shortform")?.implementationPath ?? "",
    /AI runtime exists; Workforce short-form provider is not wired/,
  );

  // seo.audit
  const seo = await requestCapability(
    {
      requestId: "seo-1",
      missionId: "m-a",
      tenantId: A,
      department: "seo",
      role: "auditor",
      capability: "seo.audit",
      inputArtifactIds: ["snap-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A },
      input: {
        propertyUrl: "https://example.com",
        pages: [{ url: "https://example.com/", title: "Home" }],
        site: { https: true, robotsPresent: true, sitemapPresent: false },
      },
    },
    {
      environment: { featureFlags: { search_web: true } },
      artifactResolver: (id) =>
        id === "snap-1"
          ? { id, tenantId: A, missionId: "m-a", kind: "website_snapshot" }
          : null,
    },
  );
  assert.equal(seo.status, "SUCCEEDED", String(seo.humanReason ?? seo.reasonCode ?? seo.status));
  assert.equal((seo.receipt as { kind?: string })?.kind, "capability_execution_receipt");

  const seoCross = await requestCapability(
    {
      requestId: "seo-x",
      missionId: "m-a",
      tenantId: A,
      department: "seo",
      role: "auditor",
      capability: "seo.audit",
      inputArtifactIds: [],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A },
      input: {
        siteTenantId: B,
        propertyUrl: "https://example.com",
        pages: [{ url: "https://example.com/" }],
        site: { https: true, robotsPresent: true, sitemapPresent: true },
      },
    },
    { environment: { featureFlags: { search_web: true } } },
  );
  assert.notEqual(seoCross.status, "SUCCEEDED");

  // website.generate draft
  const site = await requestCapability(
    {
      requestId: "site-1",
      missionId: "m-a",
      tenantId: A,
      department: "website",
      role: "builder",
      capability: "website.generate",
      inputArtifactIds: ["brief-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A },
      input: { businessName: "Acme Dental", industry: "dental" },
    },
    {
      entitlementSnapshot: {
        tenantId: A,
        metrics: { website_maintenance: 1 },
        remaining: { website_maintenance: 1 },
      },
      environment: { featureFlags: { website_generate: true } },
      artifactResolver: (id) =>
        id === "brief-1" ? { id, tenantId: A, missionId: "m-a", kind: "page_brief" } : null,
    },
  );
  assert.equal(site.status, "SUCCEEDED", String(site.humanReason ?? site.reasonCode ?? site.status));
  const siteDetail = (site.receipt as { detail?: Record<string, unknown> })?.detail ?? {};
  assert.ok(siteDetail.draftOnly === true || siteDetail.deployed === false || siteDetail.productionDeployAuthorized === false);

  // entitlement gate
  const noEnt = await requestCapability(
    {
      requestId: "site-0",
      missionId: "m-a",
      tenantId: A,
      department: "website",
      role: "builder",
      capability: "website.generate",
      inputArtifactIds: [],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A },
      input: { businessName: "Acme" },
    },
    {
      entitlementSnapshot: {
        tenantId: A,
        metrics: { website_maintenance: 0 },
        remaining: { website_maintenance: 0 },
      },
      environment: { featureFlags: { website_generate: true } },
    },
  );
  assert.equal(noEnt.status, "WAITING_ENTITLEMENT");

  // CRM fake client
  const store: Record<string, unknown>[] = [
    {
      id: "lead-b-1",
      tenant_id: B,
      source: "manual",
      status: "NEW",
      metadata: {},
      tags: [],
      notes: null,
      contact_name: "Secret",
      contact_phone: null,
      contact_email: null,
      assigned_to: null,
      next_follow_up_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  function client() {
    return {
      from(table: string) {
        assert.equal(table, "crm_leads");
        const ctx: { filters: Record<string, unknown>; limit: number } = {
          filters: {},
          limit: 100,
        };
        const run = async () => {
          const rows = store
            .filter((r) => Object.entries(ctx.filters).every(([k, v]) => r[k] === v))
            .slice(0, ctx.limit);
          return { data: rows, error: null };
        };
        const api: Record<string, unknown> = {};
        api.select = () => api;
        api.eq = (c: string, v: unknown) => {
          ctx.filters[c] = v;
          return api;
        };
        api.order = () => api;
        api.limit = (n: number) => {
          ctx.limit = n;
          return api;
        };
        api.insert = (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const created = {
                id: `lead-a-${store.filter((x) => x.tenant_id === A).length + 1}`,
                status: "NEW",
                tags: [],
                notes: null,
                assigned_to: null,
                next_follow_up_at: null,
                contact_name: null,
                contact_phone: null,
                contact_email: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...row,
              };
              store.push(created);
              return { data: created, error: null };
            },
          }),
        });
        api.update = (patch: Record<string, unknown>) => {
          const finish = {
            eq: (c: string, v: unknown) => {
              ctx.filters[c] = v;
              return finish;
            },
            select: () => ({
              single: async () => {
                const row = store.find((r) =>
                  Object.entries(ctx.filters).every(([k, v]) => r[k] === v),
                );
                if (!row) return { data: null, error: { message: "not_found" } };
                Object.assign(row, patch);
                return { data: row, error: null };
              },
            }),
          };
          return finish;
        };
        api.maybeSingle = async () => {
          const { data } = await run();
          return { data: data[0] ?? null, error: null };
        };
        api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          run().then(resolve, reject);
        return api;
      },
    };
  }

  bindCapabilityHost({ getServiceClient: () => client() as never });

  const crmWriteBase = {
    missionId: "m-a",
    tenantId: A,
    department: "crm" as const,
    role: "ops",
    capability: "crm.write" as const,
    inputArtifactIds: ["mut-1"],
    requestedAt: new Date().toISOString(),
  };
  const crmWriteDeps = {
    environment: { featureFlags: { crm: true } },
    artifactResolver: (id: string) =>
      id === "mut-1"
        ? { id, tenantId: A, missionId: "m-a", kind: "crm_mutation_request", status: "approved" }
        : null,
  };

  const w1 = await requestCapability(
    {
      ...crmWriteBase,
      requestId: "crm-w1",
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: { operation: "create_lead", source: "manual", contactName: "Ada", idempotencyKey: "idem-1" },
    },
    crmWriteDeps,
  );
  assert.equal(w1.status, "SUCCEEDED", String(w1.humanReason ?? w1.reasonCode ?? w1.status));

  const w2 = await requestCapability(
    {
      ...crmWriteBase,
      requestId: "crm-w2",
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: { operation: "create_lead", source: "manual", contactName: "Ada", idempotencyKey: "idem-1" },
    },
    crmWriteDeps,
  );
  assert.equal(w2.status, "SUCCEEDED", String(w2.humanReason ?? w2.reasonCode ?? w2.status));
  assert.equal((w2.receipt as { detail?: { idempotentReplay?: boolean } })?.detail?.idempotentReplay, true);
  assert.equal(store.filter((x) => x.tenant_id === A).length, 1);

  const createdLeadId = String(w1.providerReference);
  const append1 = await requestCapability(
    {
      ...crmWriteBase,
      requestId: "crm-note-1",
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: {
        operation: "append_note",
        leadId: createdLeadId,
        note: "Followed up",
        idempotencyKey: "note-idem-1",
      },
    },
    crmWriteDeps,
  );
  assert.equal(append1.status, "SUCCEEDED");
  const appendReplay = await requestCapability(
    {
      ...crmWriteBase,
      requestId: "crm-note-2",
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: {
        operation: "append_note",
        leadId: createdLeadId,
        note: "Followed up",
        idempotencyKey: "note-idem-1",
      },
    },
    crmWriteDeps,
  );
  assert.equal(appendReplay.status, "SUCCEEDED");
  assert.equal(
    (appendReplay.receipt as { detail?: { idempotentReplay?: boolean } })?.detail
      ?.idempotentReplay,
    true,
  );
  assert.equal(
    String(store.find((row) => row.id === createdLeadId)?.notes).split("Followed up").length - 1,
    1,
    "CRM append_note replay must not duplicate the note",
  );

  const cross = await requestCapability(
    {
      requestId: "crm-x",
      missionId: "m-a",
      tenantId: A,
      department: "crm",
      role: "ops",
      capability: "crm.read",
      inputArtifactIds: [],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A },
      input: { leadId: "lead-b-1" },
    },
    { environment: { featureFlags: { crm: true } } },
  );
  assert.notEqual(cross.status, "SUCCEEDED");

  const noAppr = await requestCapability(
    {
      ...crmWriteBase,
      requestId: "crm-na",
      authorizationContext: { trustedTenantId: A, approvalGranted: false },
      input: { operation: "create_lead", source: "manual", idempotencyKey: "x" },
    },
    crmWriteDeps,
  );
  assert.equal(noAppr.status, "WAITING_APPROVAL");

  // Social hosts
  let scheduleCalls = 0;
  let publishCalls = 0;
  bindCapabilityHost({
    socialSchedule: async (input) => {
      scheduleCalls += 1;
      if (input.accountId === "acct-b") {
        return { ok: false, errorCategory: "POLICY_BLOCK", errorMessage: "TENANT_FORBIDDEN" };
      }
      return { ok: true, jobId: "job-1", status: "SCHEDULED" };
    },
    socialPublish: async (input) => {
      publishCalls += 1;
      if (input.exactPayloadFingerprint === "tampered") {
        return {
          ok: false,
          errorCategory: "POLICY_BLOCK",
          errorMessage: "artifact_modified_after_approval",
        };
      }
      return {
        ok: true,
        jobId: "pub-1",
        jobStatus: "PUBLISHED",
        providerPostId: "ext-1",
        externalMutationOccurred: true,
        platform: "instagram",
      };
    },
    analyticsRead: async () => ({
      ok: true,
      sources: [
        { source: "instagram", status: "connected", reason: null, metrics: { impressions: 3 } as Record<string, number> },
        {
          source: "google_analytics",
          status: "not_configured",
          reason: "missing",
          metrics: { sessions: 0 } as Record<string, number>,
        },
      ],
    }),
  });
  resetAndBootstrapProvidersForTests();

  const socialDeps = {
    entitlementSnapshot: { tenantId: A, metrics: { social_posts: 10 }, remaining: { social_posts: 5 } },
    integrationSnapshot: { tenantId: A, connected: ["social_account"] },
    environment: { featureFlags: { social_scheduling: true, social_publishing: true } },
    artifactResolver: (id: string) =>
      id === "final-1"
        ? { id, tenantId: A, missionId: "m-a", kind: "social_final", status: "approved" }
        : null,
  };

  const sched = await requestCapability(
    {
      requestId: "s1",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "scheduler",
      capability: "social.schedule",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: true },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "Asia/Kolkata",
        idempotencyKey: "s-idem",
        // Raw payload approval must be ignored — trusted context above is authority.
        approvalGranted: false,
      },
    },
    socialDeps,
  );
  assert.equal(sched.status, "SUCCEEDED", String(sched.humanReason ?? sched.reasonCode ?? sched.status));

  // Attack: trusted approval false + raw input approval true → blocked
  const schedAttack = await requestCapability(
    {
      requestId: "s-attack",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "scheduler",
      capability: "social.schedule",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: false },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "Asia/Kolkata",
        idempotencyKey: "s-attack",
        approvalGranted: true,
        standingAuthorizationGranted: true,
        standingAuthorizationCapability: "social.schedule",
      },
    },
    socialDeps,
  );
  assert.notEqual(schedAttack.status, "SUCCEEDED");
  assert.equal(schedAttack.status, "WAITING_APPROVAL");

  // Standing auth for social.schedule (trusted) allows schedule
  const schedStanding = await requestCapability(
    {
      requestId: "s-stand",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "scheduler",
      capability: "social.schedule",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: {
        trustedTenantId: A,
        approvalGranted: false,
        standingAuthorizationGranted: true,
        authorizationKind: "PACKAGE_AUTO_PUBLISH",
        authorizationCapability: "social.schedule",
      },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "Asia/Kolkata",
        idempotencyKey: "s-stand",
      },
    },
    socialDeps,
  );
  assert.equal(schedStanding.status, "SUCCEEDED");

  const schedShadow = await requestCapability(
    {
      requestId: "s-shadow",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "scheduler",
      capability: "social.schedule",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: {
        trustedTenantId: A,
        approvalGranted: true,
        shadowMode: true,
      },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "Asia/Kolkata",
        idempotencyKey: "s-shadow",
      },
    },
    socialDeps,
  );
  assert.notEqual(schedShadow.status, "SUCCEEDED");
  assert.equal(scheduleCalls, 2, "Shadow must prevent creation of a scheduling job");

  const pubNo = await requestCapability(
    {
      requestId: "p0",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: false, shadowMode: false },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-1",
        ownerId: "o1",
        idempotencyKey: "p0",
      },
    },
    socialDeps,
  );
  assert.equal(pubNo.status, "WAITING_APPROVAL");

  const pubShadow = await requestCapability(
    {
      requestId: "ps",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: true },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-1",
        ownerId: "o1",
        idempotencyKey: "ps",
        approvalGranted: true,
      },
    },
    socialDeps,
  );
  assert.equal(pubShadow.status, "SHADOW_COMPLETED");
  assert.equal(publishCalls, 0);

  const pubOk = await requestCapability(
    {
      requestId: "pok",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-1",
        ownerId: "o1",
        idempotencyKey: "pok",
        approvalGranted: true,
      },
    },
    socialDeps,
  );
  assert.equal(pubOk.status, "SUCCEEDED", String(pubOk.humanReason ?? pubOk.reasonCode ?? pubOk.status));
  assert.ok((pubOk.receipt as { providerExternalId?: string })?.providerExternalId);

  bindCapabilityHost({
    socialPublish: async () => ({
      ok: true,
      jobId: "jq",
      jobStatus: "SCHEDULED",
      providerPostId: null,
      externalMutationOccurred: false,
    }),
  });
  const pubQueued = await requestCapability(
    {
      requestId: "pq",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-1",
        idempotencyKey: "pq",
      },
    },
    socialDeps,
  );
  assert.equal(pubQueued.status, "QUEUED");
  assert.notEqual(pubQueued.status, "SUCCEEDED");

  bindCapabilityHost({
    socialPublish: async () => ({
      ok: true,
      jobId: "jx",
      jobStatus: "PUBLISHED",
      providerPostId: null,
      externalMutationOccurred: true,
    }),
  });
  const fake = await requestCapability(
    {
      requestId: "pf",
      missionId: "m-a",
      tenantId: A,
      department: "social",
      role: "publisher",
      capability: "social.publish",
      inputArtifactIds: ["final-1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: true, shadowMode: false },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-1",
        ownerId: "o1",
        idempotencyKey: "pf",
        approvalGranted: true,
      },
    },
    socialDeps,
  );
  assert.notEqual(fake.status, "SUCCEEDED");
  assert.match(String(fake.humanReason ?? ""), /missing_external_receipt/);

  // analytics — unavailable source must not expose invented zeros
  bindCapabilityHost({
    analyticsRead: async () => ({
      ok: true,
      sources: [
        { source: "instagram", status: "connected", reason: null, metrics: { impressions: 3 } as Record<string, number> },
        {
          source: "google_analytics",
          status: "not_configured",
          reason: "missing",
          metrics: { sessions: 0 } as Record<string, number>,
        },
      ],
    }),
    socialSchedule: async () => ({ ok: true, jobId: "j", status: "SCHEDULED" }),
    socialPublish: async () => ({
      ok: true,
      jobId: "j",
      jobStatus: "PUBLISHED",
      providerPostId: "e",
      externalMutationOccurred: true,
    }),
  });
  const an = await requestCapability(
    {
      requestId: "an",
      missionId: "m-a",
      tenantId: A,
      department: "analytics",
      role: "analyst",
      capability: "analytics.read",
      inputArtifactIds: [],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A },
    },
    { integrationSnapshot: { tenantId: A, connected: ["analytics_property"] } },
  );
  assert.equal(an.status, "SUCCEEDED");
  const analyticsSources = (an.receipt as { sources?: Array<{
    source: string;
    available: boolean;
    metrics: Record<string, unknown> | null;
  }> } | undefined)?.sources ?? [];
  assert.deepEqual(
    analyticsSources.find((source) => source.source === "instagram")?.metrics,
    { impressions: 3 },
  );
  assert.equal(
    analyticsSources.find((source) => source.source === "google_analytics")?.metrics,
    null,
    "an unavailable source must not expose invented zero metrics",
  );

  // WhatsApp unbound → waiting configuration
  resetCapabilityHostForTests();
  resetAndBootstrapProvidersForTests();
  assert.equal(
    resolveCapabilityReadiness({
      capabilityKey: "whatsapp.send",
      trustedTenantId: A,
      entitlementSnapshot: {
        tenantId: A,
        metrics: { whatsapp_contacts: 5 },
        remaining: { whatsapp_contacts: 5 },
      },
      integrationSnapshot: { tenantId: A, connected: ["whatsapp_binding"] },
      authorization: { approvalGranted: true },
      requiredInputArtifactsPresent: true,
    }).executable,
    true,
  );
  const wa = await requestCapability(
    {
      requestId: "wa",
      missionId: "m-a",
      tenantId: A,
      department: "whatsapp",
      role: "sender",
      capability: "whatsapp.send",
      inputArtifactIds: ["d1"],
      requestedAt: new Date().toISOString(),
      authorizationContext: { trustedTenantId: A, approvalGranted: true },
      input: { leadId: "l1", body: "hi", idempotencyKey: "wa1" },
    },
    {
      entitlementSnapshot: {
        tenantId: A,
        metrics: { whatsapp_contacts: 5 },
        remaining: { whatsapp_contacts: 5 },
      },
      integrationSnapshot: { tenantId: A, connected: ["whatsapp_binding"] },
      artifactResolver: (id) =>
        id === "d1"
          ? { id, tenantId: A, missionId: "m-a", kind: "whatsapp_message_draft", status: "approved" }
          : null,
    },
  );
  assert.equal(wa.status, "WAITING_CONFIGURATION");

  // WhatsApp: model isHumanInitiated must never escalate — adapter always forces false.
  {
    let seenHuman: boolean | undefined;
    let seenActor: string | undefined;
    const prevMode = process.env.WHATSAPP_INTEGRATION_MODE;
    process.env.WHATSAPP_INTEGRATION_MODE = "shadow";
    bindCapabilityHost({
      getServiceClient: () => ({ from: () => ({}) }) as never,
    });
    try {
      const authProbe = await requestCapability(
        {
          requestId: "wa-human",
          missionId: "m-a",
          tenantId: A,
          department: "whatsapp",
          role: "sender",
          capability: "whatsapp.send",
          inputArtifactIds: ["d1"],
          requestedAt: new Date().toISOString(),
          authorizationContext: { trustedTenantId: A, approvalGranted: true },
          input: {
            leadId: "l1",
            body: "hi",
            idempotencyKey: "wa-human",
            isHumanInitiated: true,
          },
        },
        {
          entitlementSnapshot: {
            tenantId: A,
            metrics: { whatsapp_contacts: 5 },
            remaining: { whatsapp_contacts: 5 },
          },
          integrationSnapshot: { tenantId: A, connected: ["whatsapp_binding"] },
          artifactResolver: (id) =>
            id === "d1"
              ? { id, tenantId: A, missionId: "m-a", kind: "whatsapp_message_draft", status: "approved" }
              : null,
          executeProvider: async (_cap, input) => {
            seenHuman = input.input?.isHumanInitiated === true;
            seenActor = input.authorization?.actorKind;
            assert.equal(input.authorization?.actorKind, "workforce");
            return {
              result: {
                ok: false,
                providerKey: "whatsapp-meta",
                errorCategory: "POLICY_BLOCK",
                errorMessage: "conversation_awaiting_human",
                usage: { costKnown: false },
              },
              attempts: 1,
              providersTried: ["whatsapp-meta"],
            };
          },
        },
      );
      assert.equal(seenHuman, true, "payload may carry the flag");
      assert.equal(seenActor, "workforce");
      assert.notEqual(authProbe.status, "SUCCEEDED");
    } finally {
      if (prevMode === undefined) delete process.env.WHATSAPP_INTEGRATION_MODE;
      else process.env.WHATSAPP_INTEGRATION_MODE = prevMode;
    }
  }

  const forged = await requestCapability({
    requestId: "forge",
    missionId: "m-b",
    tenantId: B,
    department: "crm",
    role: "ops",
    capability: "crm.read",
    inputArtifactIds: [],
    requestedAt: new Date().toISOString(),
    authorizationContext: { trustedTenantId: A },
  });
  assert.equal(forged.status, "BLOCKED");
  assert.equal(forged.reasonCode, "TENANT_BINDING_MISSING");

  console.log("capability-wiring.test.ts (@stratxcel/workforce-core): ALL PASS");
  console.log("matrix", counts);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
