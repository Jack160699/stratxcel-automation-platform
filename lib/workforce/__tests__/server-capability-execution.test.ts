/**
 * Server executor integration — real host bootstrap + snapshots + requestCapability
 * with deterministic fake DB boundaries.
 *
 * Run: node --experimental-strip-types lib/workforce/__tests__/server-capability-execution.test.ts
 */
import assert from "node:assert/strict";
import {
  bindCapabilityHost,
  resetCapabilityHostForTests,
  resetAndBootstrapProvidersForTests,
  countCapabilitiesByStatus,
  countCapabilityOperationalMatrix,
} from "@stratxcel/workforce-core";
import { executeWorkforceCapabilityServer } from "../execute-capability.ts";
import { loadShadowAndKillSwitch } from "../snapshots.ts";
import { buildTenantCapabilityRuntimeMatrix } from "../capability-runtime-matrix.ts";
import {
  resolveCapabilityAuthorization,
  type ResolveAuthorizationDeps,
} from "../resolve-authorization.ts";
import { createFakeSupabase } from "../../../packages/whatsapp/src/__tests__/support/fake-supabase.ts";
import { sendOutboundWhatsAppMessage } from "@stratxcel/whatsapp";

const A = "tenant-a";
const B = "tenant-b";
const future = () => new Date(Date.now() + 86_400_000).toISOString();

const artifacts = new Map<
  string,
  { id: string; tenantId: string; missionId: string; kind: string; metadata?: Record<string, unknown> }
>();

type LeadRow = Record<string, unknown>;

function createCrmFake(seedLeads: LeadRow[] = []) {
  const leads: LeadRow[] = [...seedLeads];
  let seq = leads.length;
  const client = {
    from(table: string) {
      if (table !== "crm_leads") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          then(resolve: (v: { data: unknown[]; error: null }) => void) {
            resolve({ data: [], error: null });
          },
        };
      }
      const state: {
        filters: Record<string, unknown>;
        mode: "select" | "insert";
        payload: Record<string, unknown> | null;
        limitN: number;
      } = { filters: {}, mode: "select", payload: null, limitN: 100 };
      const chain: Record<string, unknown> = {
        select() {
          return chain;
        },
        insert(payload: Record<string, unknown>) {
          state.mode = "insert";
          state.payload = payload;
          return chain;
        },
        eq(col: string, val: unknown) {
          state.filters[col] = val;
          return chain;
        },
        order() {
          return chain;
        },
        limit(n: number) {
          state.limitN = n;
          return chain;
        },
        async maybeSingle() {
          const match = leads.find((r) =>
            Object.entries(state.filters).every(([k, v]) => r[k] === v),
          );
          return { data: match ?? null, error: null };
        },
        async single() {
          if (state.mode === "insert" && state.payload) {
            seq += 1;
            const row = {
              id: `lead-${seq}`,
              status: "NEW",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...state.payload,
            };
            leads.push(row);
            return { data: row, error: null };
          }
          const match = leads.find((r) =>
            Object.entries(state.filters).every(([k, v]) => r[k] === v),
          );
          return { data: match ?? null, error: null };
        },
        then(resolve: (v: { data: LeadRow[]; error: null }) => void) {
          const filtered = leads
            .filter((r) => Object.entries(state.filters).every(([k, v]) => r[k] === v))
            .slice(0, state.limitN);
          resolve({ data: filtered, error: null });
        },
      };
      return chain;
    },
  };
  return { client, leads };
}

async function run() {
  resetCapabilityHostForTests();
  resetAndBootstrapProvidersForTests();
  artifacts.clear();

  let hostsBoundCalls = 0;
  const crm = createCrmFake([
    {
      id: "lead-b-only",
      tenant_id: B,
      status: "NEW",
      source: "manual",
      contact_name: "Other",
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const approvals = new Map<
    string,
    {
      id: string;
      tenant_id: string;
      mission_id: string | null;
      kind: string;
      status: string;
      subject: Record<string, unknown>;
    }
  >();
  approvals.set("appr-social-a", {
    id: "appr-social-a",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "content_publish",
    status: "APPROVED",
    subject: {
      capability: "social.publish",
      artifactId: "final-a",
      accountId: "acct-a",
      variantId: "v1",
    },
  });
  approvals.set("appr-site-a", {
    id: "appr-site-a",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "deploy",
    status: "APPROVED",
    subject: { capability: "website.generate" },
  });
  approvals.set("appr-seo-a", {
    id: "appr-seo-a",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "other",
    status: "APPROVED",
    subject: { capability: "seo.audit" },
  });
  approvals.set("appr-wa-a", {
    id: "appr-wa-a",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "other",
    status: "APPROVED",
    subject: {
      capability: "whatsapp.send",
      destinationId: "lead-wa-a",
    },
  });
  approvals.set("appr-crm-a", {
    id: "appr-crm-a",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "other",
    status: "APPROVED",
    subject: { capability: "crm.write", operation: "update_lead_status" },
  });
  approvals.set("appr-sched-a", {
    id: "appr-sched-a",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "content_publish",
    status: "APPROVED",
    subject: {
      capability: "social.schedule",
      artifactId: "final-a",
      accountId: "acct-a",
      variantId: "v1",
    },
  });
  approvals.set("appr-broad", {
    id: "appr-broad",
    tenant_id: A,
    mission_id: "mission-a",
    kind: "content_publish",
    status: "APPROVED",
    subject: {},
  });

  const queueItems = new Map([
    [
      "qi-sched-a",
      {
        id: "qi-sched-a",
        authorization_id: "pkg-auth-a",
        tenant_id: A,
        variant_id: "v1",
        account_id: "acct-a",
        status: "PREPARED",
      },
    ],
  ]);
  const packageAuths = new Map([
    [
      "pkg-auth-a",
      {
        id: "pkg-auth-a",
        tenant_id: A,
        state: "ACTIVE",
        publishing_mode: "REVIEW_BEFORE_PUBLISH",
        starts_at: null as string | null,
        ends_at: null as string | null,
        revoked_at: null as string | null,
        subscription_id: "sub-a",
        entitlement_id: "ent-a",
        allowed_platforms: ["instagram"],
        content_scope: { metric: "social_posts" } as Record<string, unknown>,
      },
    ],
  ]);
  const authLoaders: ResolveAuthorizationDeps = {
    loadApproval: async (id) => {
      const row = approvals.get(id);
      if (!row) return null;
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        mission_id: row.mission_id,
        kind: row.kind,
        status: row.status,
        subject: row.subject,
      };
    },
    loadQueueItem: async (id) => queueItems.get(id) ?? null,
    loadPackageAuthorization: async (id) => packageAuths.get(id) ?? null,
    loadSubscription: async (id, tenantId) =>
      id === "sub-a" && tenantId === A
        ? {
            id: "sub-a",
            tenant_id: A,
            status: "active",
            current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
          }
        : null,
    loadEntitlement: async (id, tenantId, subscriptionId) =>
      id === "ent-a" && tenantId === A && subscriptionId === "sub-a"
        ? {
            id: "ent-a",
            tenant_id: A,
            subscription_id: "sub-a",
            metric: "social_posts",
            is_paused: false,
            limit_amount: 10,
            current_usage: 1,
          }
        : null,
    loadSocialAccount: async (id, tenantId) =>
      tenantId === A && (id === "acct-a" || id === "acct-b")
        ? {
            id,
            tenant_id: A,
            platform: "instagram",
            status: "CONNECTED",
          }
        : null,
  };

  const waSeed = createFakeSupabase({
    crm_leads: [
      {
        id: "lead-wa-a",
        tenant_id: A,
        normalized_phone: "919999000011",
        last_interaction_at: new Date().toISOString(),
      },
    ],
    whatsapp_phone_bindings: [
      {
        id: "binding-a",
        tenant_id: A,
        status: "active",
        outbound_enabled: true,
        source: "migrated_verified_bot",
      },
    ],
    kill_switches: [],
    whatsapp_conversations: [],
  });

  let capturedWaHumanFlag: boolean | undefined = undefined;
  let waProviderCalls = 0;

  const ensureHosts = () => {
    hostsBoundCalls += 1;
    bindCapabilityHost({
      getServiceClient: () => crm.client as never,
      persistMissionArtifact: async (input) => {
        const id = `art_${artifacts.size + 1}`;
        artifacts.set(id, {
          id,
          tenantId: input.tenantId,
          missionId: input.missionId,
          kind: input.kind,
          metadata: input.metadata,
        });
        return { ok: true, id };
      },
      socialSchedule: async () => ({
        ok: true,
        jobId: "job-sched-1",
        status: "SCHEDULED",
      }),
      socialPublish: async (input) => {
        if (input.idempotencyKey === "pub-queued") {
          return {
            ok: true,
            jobId: "job-q",
            jobStatus: "SCHEDULED",
            providerPostId: null,
            externalMutationOccurred: false,
          };
        }
        return {
          ok: true,
          jobId: "job-p",
          jobStatus: "PUBLISHED",
          providerPostId: "ext-post-1",
          externalMutationOccurred: true,
          platform: "instagram",
        };
      },
      analyticsRead: async () => ({
        ok: true,
        sources: [
          {
            source: "ga4",
            status: "connected",
            reason: null,
            metrics: {
              periodStart: "2026-07-13",
              periodEnd: "2026-08-11",
              landingPages: [],
            },
          },
        ],
      }),
    });
  };

  const loadMission = async (missionId: string) => {
    if (missionId === "mission-a") return { id: "mission-a", tenant_id: A };
    if (missionId === "mission-b") return { id: "mission-b", tenant_id: B };
    return null;
  };

  const resolveAuthorization: typeof resolveCapabilityAuthorization = (input, deps) =>
    resolveCapabilityAuthorization(input, { ...authLoaders, ...(deps ?? {}) });

  const successResults: Array<{ capability: string; outputArtifactIds: readonly string[] }> = [];

  const baseDeps = {
    ensureHostsBound: ensureHosts,
    loadMission,
    resolveAuthorization,
    loadEntitlementSnapshot: async (tenantId: string) => ({
      tenantId,
      metrics: {
        social_posts: 10,
        whatsapp_contacts: 50,
        website_maintenance: 1,
      },
      remaining: {
        social_posts: 5,
        whatsapp_contacts: 40,
        website_maintenance: 1,
      },
    }),
    loadIntegrationSnapshot: async (tenantId: string) => ({
      tenantId,
      connected: ["social_account", "whatsapp_binding", "analytics_property"],
    }),
    loadEnvironment: () => ({
      featureFlags: {
        social_scheduling: true,
        social_publishing: true,
        search_web: true,
        whatsapp_outbound: true,
        crm: true,
      },
    }),
    loadShadowKill: async () => ({ shadowMode: false, killSwitchActive: false }),
    resolveArtifact: async (id: string, opts: { expectedTenantId: string }) => {
      const row = artifacts.get(id);
      if (!row || row.tenantId !== opts.expectedTenantId) return null;
      return {
        id: row.id,
        tenantId: row.tenantId,
        missionId: row.missionId,
        kind: row.kind,
        status:
          typeof row.metadata?.status === "string" ? row.metadata.status : "approved",
      };
    },
  };

  // --- Capability-scoped shadow / kill ---
  {
    const prevSocial = process.env.SOCIAL_SHADOW_MODE;
    const prevWa = process.env.WHATSAPP_SHADOW_MODE;
    const prevKill = process.env.SOCIAL_PUBLISH_KILL_SWITCH;
    process.env.SOCIAL_SHADOW_MODE = "1";
    process.env.WHATSAPP_SHADOW_MODE = "0";
    process.env.SOCIAL_PUBLISH_KILL_SWITCH = "0";
    const socialShadow = await loadShadowAndKillSwitch({ tenantId: A, capability: "social.publish" });
    const crmShadow = await loadShadowAndKillSwitch({ tenantId: A, capability: "crm.write" });
    assert.equal(socialShadow.shadowMode, true);
    assert.equal(crmShadow.shadowMode, false, "SOCIAL_SHADOW_MODE must not shadow CRM");

    process.env.SOCIAL_SHADOW_MODE = "0";
    process.env.WHATSAPP_SHADOW_MODE = "1";
    const waShadow = await loadShadowAndKillSwitch({ tenantId: A, capability: "whatsapp.send" });
    const socialNoWa = await loadShadowAndKillSwitch({ tenantId: A, capability: "social.publish" });
    assert.equal(waShadow.shadowMode, true);
    assert.equal(socialNoWa.shadowMode, false, "WHATSAPP_SHADOW_MODE must not shadow Social");

    process.env.WHATSAPP_SHADOW_MODE = "0";
    process.env.SOCIAL_PUBLISH_KILL_SWITCH = "1";
    const pubKill = await loadShadowAndKillSwitch({ tenantId: A, capability: "social.publish" });
    const crmKill = await loadShadowAndKillSwitch({ tenantId: A, capability: "crm.write" });
    assert.equal(pubKill.killSwitchActive, true);
    assert.equal(crmKill.killSwitchActive, false, "SOCIAL_PUBLISH_KILL_SWITCH must not kill CRM");

    if (prevSocial === undefined) delete process.env.SOCIAL_SHADOW_MODE;
    else process.env.SOCIAL_SHADOW_MODE = prevSocial;
    if (prevWa === undefined) delete process.env.WHATSAPP_SHADOW_MODE;
    else process.env.WHATSAPP_SHADOW_MODE = prevWa;
    if (prevKill === undefined) delete process.env.SOCIAL_PUBLISH_KILL_SWITCH;
    else process.env.SOCIAL_PUBLISH_KILL_SWITCH = prevKill;
  }

  // Cross-tenant claimed tenant mismatch
  const crossClaim = await executeWorkforceCapabilityServer(
    {
      requestId: "xclaim",
      missionId: "mission-a",
      claimedTenantId: B,
      capability: "website.audit",
      department: "search_web",
      role: "auditor",
    },
    baseDeps,
  );
  assert.equal(crossClaim.status, "BLOCKED");
  assert.equal(crossClaim.reasonCode, "TENANT_BINDING_MISSING");
  assert.ok(hostsBoundCalls >= 1);

  // Manufactured approval booleans are ignored — no approvalId → not authorized
  artifacts.set("final-a", {
    id: "final-a",
    tenantId: A,
    missionId: "mission-a",
    kind: "social_final",
    metadata: { status: "approved" },
  });
  const fakeApprovalAttack = await executeWorkforceCapabilityServer(
    {
      requestId: "fake-appr",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-a"],
      // Stale boolean fields must not authorize — only approvalId / standing scope / grants.
      authorization: { approvalGranted: true } as never,
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-a",
        idempotencyKey: "fake-appr",
      },
    },
    baseDeps,
  );
  assert.notEqual(fakeApprovalAttack.status, "SUCCEEDED");
  assert.notEqual(fakeApprovalAttack.status, "QUEUED");

  // social.schedule: raw approval in input, no standing/approval ref → blocked
  const scheduleAttack = await executeWorkforceCapabilityServer(
    {
      requestId: "sched-attack",
      missionId: "mission-a",
      capability: "social.schedule",
      department: "social",
      role: "scheduler",
      inputArtifactIds: [],
      authorization: {},
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "UTC",
        idempotencyKey: "atk",
        approvalGranted: true,
      },
    },
    baseDeps,
  );
  assert.notEqual(scheduleAttack.status, "SUCCEEDED");

  // standing auth via queue item id (not bare authorization row)
  const scheduleOk = await executeWorkforceCapabilityServer(
    {
      requestId: "sched-ok",
      missionId: "mission-a",
      capability: "social.schedule",
      department: "social",
      role: "scheduler",
      inputArtifactIds: ["final-a"],
      authorization: { standingAuthorizationQueueItemId: "qi-sched-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "UTC",
        idempotencyKey: "ok-sched",
        approvalGranted: false,
      },
    },
    baseDeps,
  );
  assert.equal(scheduleOk.status, "SUCCEEDED", String(scheduleOk.humanReason ?? scheduleOk.status));

  // bare package authorization ID on manual mission cannot authorize
  const bareAuthBlocked = await executeWorkforceCapabilityServer(
    {
      requestId: "bare-auth",
      missionId: "mission-a",
      capability: "social.schedule",
      department: "social",
      role: "scheduler",
      inputArtifactIds: ["final-a"],
      authorization: { standingAuthorizationScopeId: "pkg-auth-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "UTC",
        idempotencyKey: "bare-auth",
      },
    },
    baseDeps,
  );
  assert.notEqual(bareAuthBlocked.status, "SUCCEEDED");

  // broad ambiguous content_publish approval fails closed
  const broadBlocked = await executeWorkforceCapabilityServer(
    {
      requestId: "broad",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-a"],
      authorization: { approvalId: "appr-broad" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-a",
        idempotencyKey: "broad",
      },
    },
    baseDeps,
  );
  assert.notEqual(broadBlocked.status, "SUCCEEDED");
  assert.notEqual(broadBlocked.status, "QUEUED");

  // approval for artifact A cannot publish artifact B
  artifacts.set("final-b-tenant-a", {
    id: "final-b-tenant-a",
    tenantId: A,
    missionId: "mission-a",
    kind: "social_final",
    metadata: { status: "approved" },
  });
  const wrongArtifact = await executeWorkforceCapabilityServer(
    {
      requestId: "wrong-art",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-b-tenant-a"],
      authorization: { approvalId: "appr-social-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-b-tenant-a",
        idempotencyKey: "wrong-art",
      },
    },
    baseDeps,
  );
  assert.notEqual(wrongArtifact.status, "SUCCEEDED");
  assert.notEqual(wrongArtifact.status, "QUEUED");

  // approval for account A cannot publish account B
  const wrongAccount = await executeWorkforceCapabilityServer(
    {
      requestId: "wrong-acct",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-a"],
      authorization: { approvalId: "appr-social-a" },
      input: {
        accountId: "acct-b",
        variantId: "v1",
        artifactId: "final-a",
        idempotencyKey: "wrong-acct",
      },
    },
    baseDeps,
  );
  assert.notEqual(wrongAccount.status, "SUCCEEDED");
  assert.notEqual(wrongAccount.status, "QUEUED");

  // schedule approval cannot authorize publish
  const schedAsPublish = await executeWorkforceCapabilityServer(
    {
      requestId: "sched-as-pub",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-a"],
      authorization: { approvalId: "appr-sched-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-a",
        idempotencyKey: "sched-as-pub",
      },
    },
    baseDeps,
  );
  assert.notEqual(schedAsPublish.status, "SUCCEEDED");
  assert.notEqual(schedAsPublish.status, "QUEUED");

  // social.publish SCHEDULED → QUEUED via resolved approvalId
  const pubQueued = await executeWorkforceCapabilityServer(
    {
      requestId: "pub-q",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-a"],
      authorization: { approvalId: "appr-social-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-a",
        idempotencyKey: "pub-queued",
      },
    },
    baseDeps,
  );
  assert.equal(pubQueued.status, "QUEUED");

  const pubOk = await executeWorkforceCapabilityServer(
    {
      requestId: "pub-ok",
      missionId: "mission-a",
      capability: "social.publish",
      department: "social",
      role: "publisher",
      inputArtifactIds: ["final-a"],
      authorization: { approvalId: "appr-social-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        artifactId: "final-a",
        idempotencyKey: "pub-ok",
      },
    },
    baseDeps,
  );
  assert.equal(pubOk.status, "SUCCEEDED");
  assert.equal((pubOk.receipt as { providerExternalId?: string })?.providerExternalId, "ext-post-1");
  // Social job/post IDs must remain providerReference — not artifact IDs
  assert.equal(pubOk.outputArtifactIds.length, 0);

  // Cross-tenant artifact
  artifacts.set("final-b", {
    id: "final-b",
    tenantId: B,
    missionId: "mission-b",
    kind: "social_final",
  });
  const crossArt = await executeWorkforceCapabilityServer(
    {
      requestId: "cross-art",
      missionId: "mission-a",
      capability: "social.schedule",
      department: "social",
      role: "scheduler",
      inputArtifactIds: ["final-b"],
      authorization: { approvalId: "appr-sched-a" },
      input: {
        accountId: "acct-a",
        variantId: "v1",
        scheduledAtIso: future(),
        timeZone: "UTC",
        idempotencyKey: "cross",
      },
    },
    baseDeps,
  );
  assert.notEqual(crossArt.status, "SUCCEEDED");
  // Cross-tenant artifact is rejected either at approval scope (wrong artifact)
  // or at artifact tenant binding once approval matches.
  assert.ok(
    crossArt.status === "BLOCKED" || crossArt.status === "WAITING_APPROVAL",
    `expected BLOCKED/WAITING_APPROVAL, got ${crossArt.status}`,
  );

  // website.generate
  const site = await executeWorkforceCapabilityServer(
    {
      requestId: "site-1",
      missionId: "mission-a",
      capability: "website.generate",
      department: "website",
      role: "builder",
      authorization: { approvalId: "appr-site-a" },
      input: { businessName: "Acme Raipur" },
    },
    baseDeps,
  );
  assert.equal(site.status, "SUCCEEDED", String(site.humanReason ?? site.status));
  assert.equal(site.outputArtifactIds.length, 1);
  successResults.push({ capability: "website.generate", outputArtifactIds: site.outputArtifactIds });
  const siteArt = artifacts.get(site.outputArtifactIds[0]!);
  assert.ok(siteArt);
  assert.equal(siteArt.kind, "website_draft");

  // seo.audit
  const seo = await executeWorkforceCapabilityServer(
    {
      requestId: "seo-1",
      missionId: "mission-a",
      capability: "seo.audit",
      department: "search_web",
      role: "auditor",
      authorization: { approvalId: "appr-seo-a" },
      input: {
        propertyUrl: "https://example.com",
        pages: [{ url: "https://example.com/", title: "Home" }],
        site: { https: true, robotsPresent: true, sitemapPresent: true },
      },
    },
    baseDeps,
  );
  assert.equal(seo.status, "SUCCEEDED", String(seo.humanReason ?? seo.status));
  assert.equal(seo.outputArtifactIds.length, 1);
  successResults.push({ capability: "seo.audit", outputArtifactIds: seo.outputArtifactIds });
  assert.equal(artifacts.get(seo.outputArtifactIds[0]!)?.kind, "seo_audit_report");

  // analytics.read — a real provider may truthfully return an empty result set.
  const analytics = await executeWorkforceCapabilityServer(
    {
      requestId: "analytics-1",
      missionId: "mission-a",
      capability: "analytics.read",
      department: "analytics",
      role: "analyst",
      input: { sources: ["ga4"] },
    },
    baseDeps,
  );
  assert.equal(analytics.status, "SUCCEEDED", String(analytics.humanReason ?? analytics.status));
  assert.equal(analytics.outputArtifactIds.length, 1);
  successResults.push({
    capability: "analytics.read",
    outputArtifactIds: analytics.outputArtifactIds,
  });
  assert.equal(artifacts.get(analytics.outputArtifactIds[0]!)?.kind, "analytics_evidence");
  assert.equal(
    (analytics.receipt as { detail?: { metricsInvented?: boolean } })?.detail?.metricsInvented,
    false,
  );

  // --- REAL CRM server integration ---
  const crmRead = await executeWorkforceCapabilityServer(
    {
      requestId: "crm-read-1",
      missionId: "mission-a",
      capability: "crm.read",
      department: "crm",
      role: "crm_reader",
      input: { limit: 10 },
    },
    baseDeps,
  );
  assert.equal(crmRead.status, "SUCCEEDED", String(crmRead.humanReason ?? crmRead.status));
  assert.equal(crmRead.outputArtifactIds.length, 1);
  successResults.push({ capability: "crm.read", outputArtifactIds: crmRead.outputArtifactIds });
  const snap = artifacts.get(crmRead.outputArtifactIds[0]!);
  assert.ok(snap);
  assert.equal(snap.kind, "crm_snapshot");
  assert.equal(await baseDeps.resolveArtifact(crmRead.outputArtifactIds[0]!, { expectedTenantId: A }) != null, true);

  const crmWrite = await executeWorkforceCapabilityServer(
    {
      requestId: "crm-write-1",
      missionId: "mission-a",
      capability: "crm.write",
      department: "crm",
      role: "crm_writer",
      authorization: {
        trustedSystemGrant: {
          kind: "HERMES_MISSION_TOOL_GRANT",
          toolName: "create_crm_lead",
          missionToolAllowed: true,
        },
      },
      input: {
        operation: "create_lead",
        contactName: "Lead A",
        source: "manual",
        idempotencyKey: "crm-idem-1",
      },
    },
    baseDeps,
  );
  assert.equal(crmWrite.status, "SUCCEEDED", String(crmWrite.humanReason ?? crmWrite.status));
  assert.ok(crmWrite.providerReference);
  assert.equal(crmWrite.outputArtifactIds.length, 0, "lead IDs must not be outputArtifactIds");
  const leadA = crm.leads.find((l) => l.id === crmWrite.providerReference);
  assert.ok(leadA);
  assert.equal(leadA.tenant_id, A);
  assert.equal(
    (crmWrite.receipt as { detail?: { authorizationKind?: string } })?.detail?.authorizationKind,
    "HERMES_MISSION_TOOL_GRANT",
  );

  const crmReplay = await executeWorkforceCapabilityServer(
    {
      requestId: "crm-write-1-replay",
      missionId: "mission-a",
      capability: "crm.write",
      department: "crm",
      role: "crm_writer",
      authorization: {
        trustedSystemGrant: {
          kind: "HERMES_MISSION_TOOL_GRANT",
          toolName: "create_crm_lead",
          missionToolAllowed: true,
        },
      },
      input: {
        operation: "create_lead",
        contactName: "Lead A",
        source: "manual",
        idempotencyKey: "crm-idem-1",
      },
    },
    baseDeps,
  );
  assert.equal(crmReplay.status, "SUCCEEDED");
  assert.equal(crmReplay.providerReference, crmWrite.providerReference);
  assert.equal(
    crm.leads.filter((l) => (l.metadata as { workforce_idempotency_key?: string })?.workforce_idempotency_key === "crm-idem-1")
      .length,
    1,
  );

  // Tenant A tries Tenant B lead (explicit approval, not Hermes create-only grant)
  const crmCross = await executeWorkforceCapabilityServer(
    {
      requestId: "crm-cross",
      missionId: "mission-a",
      capability: "crm.write",
      department: "crm",
      role: "crm_writer",
      authorization: { approvalId: "appr-crm-a" },
      input: {
        operation: "update_lead_status",
        leadId: "lead-b-only",
        status: "CONTACTED",
      },
    },
    baseDeps,
  );
  assert.notEqual(crmCross.status, "SUCCEEDED");
  assert.ok(
    crmCross.humanReason?.includes("TENANT") ||
      crmCross.reasonCode === "POLICY_BLOCK" ||
      String((crmCross as { errorMessage?: string }).errorMessage ?? "").includes("TENANT") ||
      crmCross.status === "FAILED" ||
      crmCross.status === "BLOCKED",
  );

  // Hermes grant without missionToolAllowed
  const hermesDenied = await executeWorkforceCapabilityServer(
    {
      requestId: "crm-hermes-denied",
      missionId: "mission-a",
      capability: "crm.write",
      department: "crm",
      role: "crm_writer",
      authorization: {
        trustedSystemGrant: {
          kind: "HERMES_MISSION_TOOL_GRANT",
          toolName: "create_crm_lead",
          missionToolAllowed: false,
        },
      },
      input: { operation: "create_lead", contactName: "X", source: "manual", idempotencyKey: "x" },
    },
    baseDeps,
  );
  assert.notEqual(hermesDenied.status, "SUCCEEDED");

  // --- REAL WhatsApp human-flag security ---
  const prevWaMode = process.env.WHATSAPP_INTEGRATION_MODE;
  process.env.WHATSAPP_INTEGRATION_MODE = "shadow";

  artifacts.set("wa-draft-a", {
    id: "wa-draft-a",
    tenantId: A,
    missionId: "mission-a",
    kind: "whatsapp_message_draft",
    metadata: { status: "approved" },
  });

  capturedWaHumanFlag = undefined;
  waProviderCalls = 0;

  const waDeps = {
    ...baseDeps,
    ensureHostsBound: () => {
      hostsBoundCalls += 1;
      bindCapabilityHost({
        getServiceClient: () => waSeed.client as never,
        persistMissionArtifact: async (input) => {
          const id = `art_${artifacts.size + 1}`;
          artifacts.set(id, {
            id,
            tenantId: input.tenantId,
            missionId: input.missionId,
            kind: input.kind,
            metadata: input.metadata,
          });
          return { ok: true, id };
        },
        sendWhatsAppOutbound: async (_client, input) => {
          capturedWaHumanFlag = input.isHumanInitiated;
          waProviderCalls += 1;
          // Always use the instrumented fake WhatsApp DB — prove the choke-point args.
          const outcome = await sendOutboundWhatsAppMessage(waSeed.client as never, {
            tenantId: input.tenantId,
            leadId: input.leadId,
            body: input.body,
            idempotencyKey: input.idempotencyKey,
            templateId: input.templateId,
            templateName: input.templateName,
            templateLanguage: input.templateLanguage,
            templateParams: input.templateParams,
            isHumanInitiated: input.isHumanInitiated,
          });
          if (!outcome.ok) return { ok: false as const, reason: outcome.reason };
          if (outcome.alreadySent) {
            return { ok: true as const, messageId: outcome.messageId, alreadySent: true };
          }
          return {
            ok: true as const,
            messageId: outcome.messageId,
            alreadySent: false,
            mode: outcome.mode,
            providerId: outcome.providerId,
          };
        },
      });
    },
  };

  const waResult = await executeWorkforceCapabilityServer(
    {
      requestId: "wa-human-2",
      missionId: "mission-a",
      capability: "whatsapp.send",
      department: "whatsapp",
      role: "sender",
      inputArtifactIds: ["wa-draft-a"],
      authorization: { approvalId: "appr-wa-a" },
      input: {
        leadId: "lead-wa-a",
        body: "hello from workforce",
        idempotencyKey: "wa-human-2",
        isHumanInitiated: true,
      },
    },
    waDeps,
  );

  assert.ok(
    waResult.status === "SUCCEEDED" || waResult.status === "QUEUED",
    `whatsapp.send expected success/queued, got ${waResult.status} ${waResult.humanReason}`,
  );
  assert.ok(waProviderCalls >= 1, "outbound sender boundary must be invoked");
  assert.equal(capturedWaHumanFlag, false, "isHumanInitiated must be forced false");
  assert.equal(waResult.outputArtifactIds.length, 0, "whatsapp_messages.id must not be outputArtifactIds");
  assert.ok(waResult.providerReference);

  // handoff conversation blocks automation
  waSeed.tables.whatsapp_conversations = [
    {
      id: "convo-handoff",
      tenant_id: A,
      lead_id: "lead-wa-a",
      automation_mode: "handoff",
      status: "open",
    },
  ];
  const waHandoff = await executeWorkforceCapabilityServer(
    {
      requestId: "wa-handoff",
      missionId: "mission-a",
      capability: "whatsapp.send",
      department: "whatsapp",
      role: "sender",
      inputArtifactIds: ["wa-draft-a"],
      authorization: { approvalId: "appr-wa-a" },
      input: {
        leadId: "lead-wa-a",
        body: "should not send",
        idempotencyKey: "wa-handoff-1",
        isHumanInitiated: true,
      },
    },
    waDeps,
  );
  assert.notEqual(waHandoff.status, "SUCCEEDED");
  assert.notEqual(waHandoff.status, "QUEUED");
  const handoffShadow = (waSeed.tables.whatsapp_shadow_messages ?? []).filter(
    (m) => m.body === "should not send",
  );
  assert.equal(handoffShadow.length, 0, "handoff must not produce outbound provider/shadow send");

  if (prevWaMode === undefined) delete process.env.WHATSAPP_INTEGRATION_MODE;
  else process.env.WHATSAPP_INTEGRATION_MODE = prevWaMode;

  // Global outputArtifactId invariant
  for (const result of successResults) {
    for (const id of result.outputArtifactIds) {
      const resolved = await baseDeps.resolveArtifact(id, { expectedTenantId: A });
      assert.ok(resolved, `outputArtifactId ${id} from ${result.capability} must resolve`);
    }
  }

  const counts = countCapabilitiesByStatus();
  assert.equal(counts.AVAILABLE, 11);
  const matrix = await countCapabilityOperationalMatrix({ tenantId: A });
  assert.ok(matrix.providerOperational <= matrix.staticAvailable);
  assert.ok(matrix.providerOperational >= 3);

  const runtime = await buildTenantCapabilityRuntimeMatrix({
    tenantId: A,
    entitlementSnapshot: await baseDeps.loadEntitlementSnapshot(A),
    integrationSnapshot: await baseDeps.loadIntegrationSnapshot(A),
    environment: baseDeps.loadEnvironment(),
    authorizationForCapability: async () => null,
  });
  assert.equal(runtime.STATIC_AVAILABLE_COUNT, counts.AVAILABLE);
  assert.ok(runtime.PROVIDER_READY_COUNT <= runtime.STATIC_AVAILABLE_COUNT);
  assert.ok(runtime.RUNTIME_EXECUTABLE_NOW_COUNT <= runtime.TENANT_TECHNICALLY_READY_COUNT);
  assert.ok(
    runtime.EXECUTION_REQUIRES_APPROVAL_COUNT >= 1,
    "approval-required caps should appear when technically ready without auth",
  );

  console.log("server-capability-execution.test.ts: ALL PASS");
  console.log({
    staticAvailable: matrix.staticAvailable,
    providerOperational: matrix.providerOperational,
    STATIC_AVAILABLE_COUNT: runtime.STATIC_AVAILABLE_COUNT,
    PROVIDER_READY_COUNT: runtime.PROVIDER_READY_COUNT,
    TENANT_TECHNICALLY_READY_COUNT: runtime.TENANT_TECHNICALLY_READY_COUNT,
    EXECUTION_REQUIRES_APPROVAL_COUNT: runtime.EXECUTION_REQUIRES_APPROVAL_COUNT,
    RUNTIME_EXECUTABLE_NOW_COUNT: runtime.RUNTIME_EXECUTABLE_NOW_COUNT,
  });
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
