import { createServiceClient as createBrandBrainClient, getCurrentBrandBrain } from "@stratxcel/brand-brain";
import { createServiceClient as createMissionsClient, appendMissionEvent, getServiceCatalogueEntry } from "@stratxcel/missions";
import { createServiceClient as createApprovalsClient, requestApproval, listPendingApprovals } from "@stratxcel/approvals";
import { createServiceClient as createHandoffClient, createHumanHandoff } from "@stratxcel/human-handoff";
import { recordAuditEvent, createServiceClient as createAuditClient } from "@stratxcel/audit";
import { listSearchState } from "@stratxcel/search-discovery";
import { listLeads, updateLeadStatus, type LeadStatus } from "@stratxcel/leads-and-crm";
import { inspectDomainDns, getVercelDomainStatus } from "@stratxcel/websites-and-domains";
import { assertSafeMemoryValue, MEMORY_CONFIDENCE_VALUES, type MemoryConfidence } from "@stratxcel/agent-core";
import {
  assertConnectorCapabilityAuthorized,
  createServiceClient as createConnectorsClient,
  getConnectorConnection,
  executeBrowserAction,
  executeComputerAction,
  executeConnectorCapability,
  selectBestResource,
  resolveConnectorHealth,
  discoverConnectorCapabilities,
  probeGoogleCapabilities,
  executeCoreMcpCapability,
  decomposeNaturalLanguageIntent,
  executeDecomposedPlan,
  initiateWebsiteCreation,
} from "@stratxcel/connectors";
import type { ToolName } from "@stratxcel/hermes";
import { STRATXCEL_CONTROLLED_TOOLS } from "@stratxcel/hermes";
import { lookupSocialPublicationStatus } from "../../../lib/social/workforce/publication-status-lookup.ts";
import { toHermesPublicationStatusPayload } from "../../../lib/social/workforce/publication-status.ts";

export interface ToolCallContext {
  missionId: string;
  tenantId: string;
  correlationId: string;
  /**
   * Verified mission-token allowlist — set only by the Hermes dispatcher
   * after token verification. Never model-supplied.
   */
  allowedTools?: readonly string[];
}

export class ToolNotAvailableError extends Error {
  constructor(tool: string) {
    super(`Tool '${tool}' is StratExcel-controlled and is not callable by Hermes`);
    this.name = "ToolNotAvailableError";
  }
}

type ToolHandler = (ctx: ToolCallContext, input: Record<string, unknown>) => Promise<Record<string, unknown>>;

function isMemoryConfidence(value: unknown): value is MemoryConfidence {
  return typeof value === "string" && (MEMORY_CONFIDENCE_VALUES as readonly string[]).includes(value);
}

/**
 * One handler per restricted tool, each constructing only the package
 * client(s) it needs and scoping every read/write to ctx.tenantId (never
 * trusting an input field for tenant identity — the tenant comes from the
 * verified mission token, not from the request body). submit_publish_request
 * and create_website_change_request are intentionally NOT registered here:
 * calling either throws ToolNotAvailableError regardless of what the
 * token's allowedTools says, a second enforcement layer on top of
 * context.ts's default allowlist already excluding them.
 */
export const TOOL_HANDLERS: Partial<Record<ToolName, ToolHandler>> = {
  async get_brand_context(ctx) {
    const supabase = createBrandBrainClient();
    const current = await getCurrentBrandBrain(supabase, ctx.tenantId);
    return { brandBrain: current?.content ?? null, brandBrainVersion: current?.current_version ?? null };
  },

  async get_service_definition(ctx) {
    const supabase = createMissionsClient();
    const { data: mission } = await supabase.from("missions").select("service_key").eq("id", ctx.missionId).maybeSingle();
    const entry = mission?.service_key ? getServiceCatalogueEntry(mission.service_key) : null;
    if (!entry) return { serviceKey: null, label: null, description: null };
    return { serviceKey: entry.key, label: entry.label, description: entry.description };
  },

  async create_draft_artifact(ctx, input) {
    const supabase = createMissionsClient();
    const { data, error } = await supabase
      .from("mission_artifacts")
      .insert({
        mission_id: ctx.missionId,
        kind: input.kind as string,
        storage_ref: input.storageRef as string,
        metadata: (input.metadata as Record<string, unknown>) ?? {},
      })
      .select("id")
      .single();
    if (error) throw new Error(`create_draft_artifact: ${error.message}`);
    return { artifactId: data.id as string };
  },

  async update_mission_progress(ctx, input) {
    const supabase = createMissionsClient();
    await appendMissionEvent(supabase, {
      missionId: ctx.missionId,
      eventType: "hermes_progress",
      payload: { message: input.message as string, data: input.data ?? {} },
    });
    return { recorded: true };
  },

  async request_approval(ctx, input) {
    const supabase = createApprovalsClient();
    const approval = await requestApproval(supabase, {
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      kind: input.kind as "content_publish" | "spend" | "deploy" | "other",
      subject: (input.subject as Record<string, unknown>) ?? {},
      requestedBy: "hermes",
    });
    return { approvalId: approval.id, status: "PENDING" };
  },

  async get_approval_status(ctx, input) {
    const supabase = createApprovalsClient();
    const pending = await listPendingApprovals(supabase, ctx.tenantId);
    const match = pending.find((a) => a.id === input.approvalId);
    return { status: match ? match.status : "EXPIRED" };
  },

  async create_human_handoff(ctx, input) {
    const supabase = createHandoffClient();
    const handoff = await createHumanHandoff(supabase, {
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      reason: input.reason as string,
      contextSnapshot: (input.contextSnapshot as Record<string, unknown>) ?? {},
    });
    return { handoffId: handoff.id };
  },

  async query_publication_status(ctx, input) {
    // Social Department owns publication state. Query tenant-scoped Social
    // jobs/queue only — never fabricate status or return provider credentials.
    const reference = String(input.reference ?? "");
    try {
      const supabase = createMissionsClient();
      const result = await lookupSocialPublicationStatus(supabase as never, ctx.tenantId, reference);
      return toHermesPublicationStatusPayload(result);
    } catch {
      return toHermesPublicationStatusPayload({
        status: "UNKNOWN",
        reference,
        liveUrl: null,
        providerPublishId: null,
        publishedAtIso: null,
        scheduleJobId: null,
        shadow: false,
        safeDetail: "publication_status_lookup_unavailable",
      });
    }
  },

  async create_crm_lead(ctx, input) {
    // Route through canonical Workforce capability executor — never bypass
    // tenant/entitlement/receipt policy with a direct createLead call alone.
    // Authority is HERMES_MISSION_TOOL_GRANT only when the verified mission
    // token allowed create_crm_lead — never a manufactured human approval.
    const missionToolAllowed = (ctx.allowedTools ?? []).includes("create_crm_lead");
    if (!missionToolAllowed) {
      return {
        ok: false,
        status: "BLOCKED",
        reasonCode: "POLICY_BLOCK",
        humanReason: "create_crm_lead not in verified mission allowedTools",
      };
    }
    const { executeWorkforceCapabilityServer } = await import(
      "../../../lib/workforce/execute-capability.ts"
    );
    const result = await executeWorkforceCapabilityServer({
      requestId: `hermes-crm-${ctx.correlationId}`,
      missionId: ctx.missionId,
      claimedTenantId: ctx.tenantId,
      capability: "crm.write",
      department: "crm",
      role: "crm_writer",
      inputArtifactIds: [],
      authorization: {
        actorKind: "hermes",
        trustedSystemGrant: {
          kind: "HERMES_MISSION_TOOL_GRANT",
          toolName: "create_crm_lead",
          missionToolAllowed: true,
        },
      },
      input: {
        operation: "create_lead",
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        source: "manual",
        metadata: {
          ...((input.metadata as Record<string, unknown>) ?? {}),
          hermesCorrelationId: ctx.correlationId,
          authorizationKind: "HERMES_MISSION_TOOL_GRANT",
        },
        idempotencyKey: `hermes-crm-lead:${ctx.missionId}:${ctx.correlationId}`,
      },
    });

    if (result.status !== "SUCCEEDED") {
      return {
        ok: false,
        status: result.status,
        reasonCode: result.reasonCode ?? null,
        humanReason: result.humanReason ?? "crm.write_failed",
      };
    }
    const leadId = result.providerReference ?? null;
    return {
      leadId,
      receipt: result.receipt ?? null,
      capabilityStatus: result.status,
      authorizationKind: "HERMES_MISSION_TOOL_GRANT",
    };
  },

  async attach_research_evidence(ctx, input) {
    const supabase = createMissionsClient();
    const artifactId = typeof input.artifactId === "string" ? input.artifactId : "";
    if (!artifactId) throw new Error("attach_research_evidence: artifact_required");
    const [{ data: artifact, error: artifactError }, { data: mission, error: missionError }] =
      await Promise.all([
        supabase
          .from("mission_artifacts")
          .select("id, mission_id")
          .eq("id", artifactId)
          .maybeSingle(),
        supabase
          .from("missions")
          .select("id, tenant_id")
          .eq("id", ctx.missionId)
          .maybeSingle(),
      ]);
    if (
      artifactError ||
      missionError ||
      !artifact ||
      artifact.mission_id !== ctx.missionId ||
      !mission ||
      mission.tenant_id !== ctx.tenantId
    ) {
      throw new Error("attach_research_evidence: artifact_scope_rejected");
    }
    await appendMissionEvent(supabase, {
      missionId: ctx.missionId,
      eventType: "research_evidence",
      payload: { artifactId, sourceUrl: input.sourceUrl ?? null, summary: input.summary },
    });
    return { recorded: true };
  },

  // Exposes the real, already-live Growth/Priority Engine to Hermes missions
  // -- reuses listSearchState (@stratxcel/search-discovery) unmodified, the
  // exact same real function lib/agent-core/growth-media-tools.ts's own
  // check_growth_status tool (WhatsApp/Admin Copilot) calls and the Search
  // Growth dashboard reads from. Read-only, never re-crawls; tenant comes
  // from the verified mission context, never a model-supplied argument.
  async check_growth_status(ctx) {
    const state = await listSearchState(createMissionsClient() as never, ctx.tenantId);
    return { ...state };
  },

  // Exposes the real Website Factory to Hermes missions -- the same
  // site_projects columns lib/agent-core/growth-media-tools.ts's own
  // check_website_status tool and the Admin Website page already read.
  // Read-only; tenant comes from the verified mission context only.
  async check_website_status(ctx) {
    const supabase = createMissionsClient();
    const { data: sites, error } = await supabase
      .from("site_projects")
      .select("id, tenant_id, name, slug, status, custom_domain, template_id, created_at, updated_at")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`check_website_status: ${error.message}`);
    const normalizedSites = (sites ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      template: s.template_id,
      framework: "nextjs",
    }));
    return { sites: normalizedSites };
  },

  // First-class autonomous website creation for Hermes missions:
  // Initializes project shell, Antigravity coding task contract (WEBSITE_BUILD_NEW),
  // planned GitHub repository, and Vercel preview deployment.
  async create_website(ctx, input) {
    const supabase = createMissionsClient();
    const result = await initiateWebsiteCreation(supabase as never, {
      tenantId: ctx.tenantId,
      goalText: typeof input.purpose === "string" ? input.purpose : "Create new website",
      businessName: typeof input.businessName === "string" ? input.businessName : undefined,
      purpose: typeof input.purpose === "string" ? input.purpose : undefined,
      designPreference: typeof input.designPreference === "string" ? input.designPreference : undefined,
      domain: typeof input.domain === "string" ? input.domain : undefined,
      actorUserId: ctx.missionId,
    });
    return result as unknown as Record<string, unknown>;
  },

  // Exposes the real CRM (leads-and-crm) to Hermes missions -- reuses
  // listLeads unmodified, the exact same real function
  // packages/agent-core/src/tools/admin/read-tools.ts's own list_leads
  // tool already calls. Read-only companion to the existing create_crm_lead
  // mutation -- lets a mission check the pipeline before creating a
  // duplicate, or report on it. Tenant comes from the verified mission
  // context only, never an input field.
  async list_leads(ctx, input) {
    const limit = typeof input.limit === "number" ? Math.min(input.limit, 50) : 20;
    const supabase = createMissionsClient();
    const leads = await listLeads(supabase as never, ctx.tenantId, limit);
    return { leads };
  },

  // Single-lead companion to list_leads -- same real crm_leads table, both
  // real ctx.tenantId AND the requested id must match (never a cross-tenant
  // lead lookup, even with a guessed/leaked id from another tenant).
  async get_lead(ctx, input) {
    const leadId = typeof input.leadId === "string" ? input.leadId : "";
    if (!leadId) return { found: false };
    const supabase = createMissionsClient();
    const { data, error } = await supabase
      .from("crm_leads")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error(`get_lead: ${error.message}`);
    if (!data) return { found: false };
    return { found: true, lead: data };
  },

  // Mutation companion to list_leads/get_lead -- moves a real lead through
  // the pipeline. leads-and-crm's own updateLeadStatus(leadId, status) is
  // NOT tenant-scoped internally (matches its two other real callers:
  // app/api/platform/leads/[leadId]/route.ts and
  // packages/workforce-core/src/adapters/crm.ts's loadOwnedLead), so this
  // handler re-verifies tenant ownership with its own scoped existence
  // check first -- the exact same pattern those two callers already use --
  // rather than trust a bare leadId. Never invokes updateLeadStatus without
  // that check passing first.
  async update_lead_status(ctx, input) {
    const leadId = typeof input.leadId === "string" ? input.leadId : "";
    const status = typeof input.status === "string" ? (input.status as LeadStatus) : ("" as LeadStatus);
    if (!leadId || !status) return { updated: false };
    const supabase = createMissionsClient();
    const { data: existing, error: existingError } = await supabase
      .from("crm_leads")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", leadId)
      .maybeSingle();
    if (existingError) throw new Error(`update_lead_status: ${existingError.message}`);
    if (!existing) return { updated: false };
    const lead = await updateLeadStatus(supabase as never, { leadId, status });
    return { updated: true, lead };
  },

  // Exposes the real Creative Studio image engine to Hermes missions --
  // reuses executeGenerateImageTool (lib/social/agent/generate-image-tool.ts)
  // completely unmodified, the exact same real function
  // lib/agent-core/growth-media-tools.ts's own generate_image tool
  // (WhatsApp/Admin Copilot) already calls, with its real default
  // production dependencies (real tenant plan/spend resolution, real
  // media runtime, real tenant monthly AI budget gate) -- not overridden,
  // not reimplemented. Hermes' own pre-call mission-budget check already
  // ran in native-adapter.ts before this handler is ever invoked; this is
  // the second, independent, tenant-level gate. Billing/asset attribution
  // uses the mission's real creator (missions.created_by) as the actor --
  // never a fabricated system user -- and refuses honestly if a mission
  // somehow has none, rather than guessing one.
  async generate_image(ctx, input) {
    const brief = typeof input.brief === "string" ? input.brief : "";
    if (!brief) return { outcome: "FAILED", reason: "missing_brief" };

    const connectorsClient = createConnectorsClient();
    let preferredResource: Awaited<ReturnType<typeof selectBestResource>> | null = null;
    try {
      preferredResource = await selectBestResource(connectorsClient as never, {
        capabilityKey: "image.generate",
        tenantId: ctx.tenantId,
        missionId: ctx.missionId,
        requireAutonomous: true,
      });
    } catch {
      // Fall through to default image tool
    }

    // Autonomously execute via Google Founder Computer if AVAILABLE
    if (
      preferredResource?.selected &&
      preferredResource.selected.connectorKey === "founder_computer" &&
      preferredResource.selected.status === "AVAILABLE"
    ) {
      const execResult = await executeConnectorCapability(connectorsClient as never, {
        connectorKey: "founder_computer",
        capabilityKey: "image.generate",
        tenantId: ctx.tenantId,
        missionId: ctx.missionId,
        actorKind: "hermes",
        payload: {
          prompt: brief,
          aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : "1:1",
        },
      });
      return execResult as unknown as Record<string, unknown>;
    }

    const supabase = createMissionsClient();
    const { data: missionRow, error: missionError } = await supabase
      .from("missions")
      .select("created_by")
      .eq("id", ctx.missionId)
      .maybeSingle();
    if (missionError) throw new Error(`generate_image: ${missionError.message}`);
    const actorUserId = (missionRow as { created_by?: string | null } | null)?.created_by;
    if (!actorUserId) {
      return { outcome: "FAILED", reason: "mission_has_no_creator_to_attribute_image_generation_to" };
    }

    const { executeGenerateImageTool } = await import(
      "../../../lib/social/agent/generate-image-tool.ts"
    );
    return executeGenerateImageTool(
      { ok: true, mode: "tenant", tenantId: ctx.tenantId, actorUserId, supabase: supabase as never },
      {
        brief,
        aspectRatio: typeof input.aspectRatio === "string" ? input.aspectRatio : "1:1",
        candidateCount: 1,
      },
    );
  },

  // Exposes real, live domain status (public DNS + Vercel verification/SSL)
  // to Hermes missions -- reuses inspectDomainDns/getVercelDomainStatus
  // (@stratxcel/websites-and-domains) unmodified, the same real functions
  // lib/agent-core/growth-media-tools.ts's own check_domain_status tool
  // already calls. Domain-scoped, not tenant-row-scoped (public DNS lookup
  // + "does Vercel know this domain" -- no cross-tenant data exposure,
  // matching that existing tool's own behavior exactly).
  async check_domain_status(_ctx, input) {
    const domain = typeof input.domain === "string" ? input.domain.trim() : "";
    if (!domain) return { available: false, reason: "domain is required" };
    const [dns, vercel] = await Promise.all([
      inspectDomainDns({ domain }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : "dns_inspection_failed" })),
      getVercelDomainStatus(domain).catch((err: unknown) => ({ error: err instanceof Error ? err.message : "vercel_status_failed" })),
    ]);
    return { domain, dns, vercel };
  },

  // Exposes the real, shared company-memory store (agent_memories -- the
  // same real table WhatsApp/Admin Copilot's own remember_fact/recall_memory
  // tools already use) to Hermes missions, scoped to the mission's real
  // verified tenant only (workspace scope). Deliberately does NOT reuse
  // rememberAgentFact/listAgentMemories (@stratxcel/agent-core) directly --
  // those require a full AgentPrincipal, and their own scopeFilter only
  // allows a CLIENT principal to write workspace-scoped memory, not staff
  // (which is structurally what a Hermes mission resembles). Rather than
  // force-fit a synthetic principal into a security boundary designed for
  // live human sessions, this writes directly to the same real table with
  // Hermes' own already-verified ctx.tenantId, matching every other tool
  // in this file. assertSafeMemoryValue (the real secret-pattern guard) is
  // reused unmodified. Deliberately additive-only: no forget/delete
  // exposed to Hermes -- erasing durable company memory stays a
  // human-initiated action via the existing WhatsApp/Admin Copilot tools.
  async remember_company_fact(ctx, input) {
    const key = typeof input.key === "string" ? input.key : "";
    const value = typeof input.value === "string" ? input.value : "";
    if (!key || !value) return { outcome: "FAILED", reason: "missing_key_or_value" };
    assertSafeMemoryValue(value);
    // Section 19: never default to sounding more certain than the mission
    // actually is -- an invalid/omitted confidence falls back to the same
    // safe "UNKNOWN" the DB column itself defaults to, never FACT/VERIFIED.
    const confidence = isMemoryConfidence(input.confidence) ? input.confidence : "UNKNOWN";

    const supabase = createMissionsClient();
    const { data: missionRow, error: missionError } = await supabase
      .from("missions")
      .select("created_by")
      .eq("id", ctx.missionId)
      .maybeSingle();
    if (missionError) throw new Error(`remember_company_fact: ${missionError.message}`);
    const createdBy = (missionRow as { created_by?: string | null } | null)?.created_by;
    if (!createdBy) return { outcome: "FAILED", reason: "mission_has_no_creator_to_attribute_this_memory_to" };

    const { data: existing, error: existingError } = await supabase
      .from("agent_memories")
      .select("id")
      .eq("scope", "workspace")
      .eq("tenant_id", ctx.tenantId)
      .eq("memory_key", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingError) throw new Error(`remember_company_fact: ${existingError.message}`);

    if (existing) {
      const { error } = await supabase
        .from("agent_memories")
        .update({ memory_value: value, confidence, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(`remember_company_fact: ${error.message}`);
      return { remembered: true, confidence };
    }

    const { error } = await supabase.from("agent_memories").insert({
      scope: "workspace",
      tenant_id: ctx.tenantId,
      owner_auth_user_id: null,
      memory_key: key,
      memory_value: value,
      confidence,
      source_channel: "hermes",
      created_by: createdBy,
    });
    if (error) throw new Error(`remember_company_fact: ${error.message}`);
    return { remembered: true, confidence };
  },

  async recall_company_memory(ctx) {
    const supabase = createMissionsClient();
    const { data, error } = await supabase
      .from("agent_memories")
      .select("id, memory_key, memory_value, confidence, updated_at")
      .eq("scope", "workspace")
      .eq("tenant_id", ctx.tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(`recall_company_memory: ${error.message}`);
    return { memories: data ?? [] };
  },

  async browser_navigate(_ctx, input) {
    return executeBrowserAction("browser.navigate", input);
  },

  async browser_click(_ctx, input) {
    return executeBrowserAction("browser.click", input);
  },

  async browser_type(_ctx, input) {
    return executeBrowserAction("browser.type", input);
  },

  async browser_key(_ctx, input) {
    return executeBrowserAction("browser.key", input);
  },

  async browser_scroll(_ctx, input) {
    return executeBrowserAction("browser.scroll", input);
  },

  async browser_select(_ctx, input) {
    return executeBrowserAction("browser.select", input);
  },

  async browser_wait(_ctx, input) {
    return executeBrowserAction("browser.wait", input);
  },

  async browser_read(_ctx, input) {
    return executeBrowserAction("browser.read", input);
  },

  async browser_screenshot(_ctx, input) {
    return executeBrowserAction("browser.screenshot", input);
  },

  async browser_upload(_ctx, input) {
    return executeBrowserAction("browser.upload", input);
  },

  async browser_download(_ctx, input) {
    return executeBrowserAction("browser.download", input);
  },

  async browser_tabs(_ctx, input) {
    return executeBrowserAction("browser.tabs", input);
  },

  async computer_open_app(_ctx, input) {
    return executeComputerAction("computer.open_app", input);
  },

  async computer_click(_ctx, input) {
    return executeComputerAction("computer.click", input);
  },

  async computer_type(_ctx, input) {
    return executeComputerAction("computer.type", input);
  },

  async computer_key(_ctx, input) {
    return executeComputerAction("computer.key", input);
  },

  async computer_screenshot(_ctx, input) {
    return executeComputerAction("computer.screenshot", input);
  },

  async computer_wait(_ctx, input) {
    return executeComputerAction("computer.wait", input);
  },

  async discover_capabilities(ctx, input) {
    const connectorsClient = createConnectorsClient();
    const providerFilter = typeof input.providerFilter === "string" ? input.providerFilter.toLowerCase() : null;
    const shouldRefresh = Boolean(input.refresh);
    const useLiveProbe = Boolean(input.liveProbe);

    let query = (connectorsClient as any)
      .from("connector_connections")
      .select("id, connector_key, status, last_verified_at, discovered_capabilities, metadata, health_status");

    if (ctx.tenantId) {
      query = query.or(`tenant_id.eq.${ctx.tenantId},tenant_id.is.null`);
    } else {
      query = query.is("tenant_id", null);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(`discover_capabilities: ${error.message}`);

    // Run live Google capability probe if requested (founder_computer provider only)
    // This navigates the real Founder Browser to each service URL and reads DOM state.
    let liveProbeResults: Array<{
      capabilityKey: string;
      status: string;
      reason: string;
      liveProbe: boolean;
      detectedAt: string;
    }> = [];

    const isFounderComputerRelevant =
      !providerFilter || providerFilter.includes("founder_computer");

    if (useLiveProbe && isFounderComputerRelevant) {
      try {
        const { results } = await probeGoogleCapabilities({
          includeRuntimePrimitives: true,
        });
        liveProbeResults = results.map((r) => ({
          capabilityKey: r.capabilityKey,
          status: r.status,
          reason: r.reason,
          liveProbe: r.liveProbe,
          detectedAt: r.detectedAt,
        }));
      } catch {
        // Live probe failed — fall back to DB-discovered state
      }
    }

    const capabilities: Array<Record<string, unknown>> = [];

    for (const row of rows ?? []) {
      const connKey = row.connector_key as string;
      if (providerFilter && !connKey.includes(providerFilter)) continue;

      if (shouldRefresh && ["founder_computer", "google_ai_pro"].includes(connKey)) {
        try {
          await discoverConnectorCapabilities(connectorsClient as never, {
            connectionId: row.id,
            connectorKey: connKey,
            tenantId: ctx.tenantId,
            actorKind: "hermes",
          });
        } catch {
          // Keep prior state on probe error
        }
      }

      const discCaps = Array.isArray(row.discovered_capabilities) ? row.discovered_capabilities : [];
      const method = connKey === "founder_computer" ? "browser" : "api";
      const connIsHealthy = ["connected", "healthy"].includes(row.status);

      for (const capKey of discCaps) {
        // Merge live probe result if available for this capability
        const liveResult = connKey === "founder_computer"
          ? liveProbeResults.find((r) => r.capabilityKey === capKey)
          : undefined;

        const status = liveResult
          ? liveResult.status
          : connIsHealthy ? "AVAILABLE" : "UNAVAILABLE";

        capabilities.push({
          provider: connKey,
          capability: capKey,
          execution_method: method,
          status,
          last_verified: liveResult?.detectedAt ?? row.last_verified_at,
          requires_confirmation: capKey.includes("video") || capKey.includes("run_task") || capKey.includes("upload"),
          probe_source: liveResult ? "live_browser_dom" : "session_metadata",
          probe_reason: liveResult?.reason,
          live_probe_used: Boolean(liveResult?.liveProbe),
        });
      }
    }

    return {
      capabilities,
      live_probe_used: liveProbeResults.length > 0,
      live_probe_count: liveProbeResults.length,
    };
  },

  async get_capability_status(ctx, input) {
    const capKey = String(input.capabilityKey);
    const connKey = typeof input.connectorKey === "string" ? input.connectorKey : undefined;
    const connectorsClient = createConnectorsClient();

    const selection = await selectBestResource(connectorsClient as never, {
      capabilityKey: capKey,
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      requireAutonomous: false,
    });

    const target = connKey
      ? selection.alternatives.find((a) => a.connectorKey === connKey) || (selection.selected?.connectorKey === connKey ? selection.selected : null)
      : selection.selected;

    return {
      status: target?.status ?? "UNKNOWN",
      capability: target ? { ...target } : null,
      reason: selection.reason,
    };
  },

  async select_best_resource(ctx, input) {
    const capKey = String(input.capabilityKey);
    const requireAutonomous = input.requireAutonomous !== false;
    const connectorsClient = createConnectorsClient();

    const selection = await selectBestResource(connectorsClient as never, {
      capabilityKey: capKey,
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      requireAutonomous,
    });

    return {
      selected: selection.selected ? { ...selection.selected } : null,
      alternatives: selection.alternatives,
      reason: selection.reason,
    };
  },

  async execute_capability(ctx, input) {
    const capKey = String(input.capabilityKey);
    const payload = (input.payload as Record<string, unknown>) ?? {};
    const connectorsClient = createConnectorsClient();

    let connectorKey = typeof input.connectorKey === "string" ? input.connectorKey : undefined;
    if (!connectorKey) {
      const selection = await selectBestResource(connectorsClient as never, {
        capabilityKey: capKey,
        tenantId: ctx.tenantId,
        missionId: ctx.missionId,
        requireAutonomous: true,
      });
      if (!selection.selected) {
        throw new Error(`execute_capability: No available resource found for capability '${capKey}'. Reason: ${selection.reason}`);
      }
      connectorKey = selection.selected.connectorKey;
    }

    const execResult = await executeConnectorCapability(connectorsClient as never, {
      connectorKey,
      capabilityKey: capKey,
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      actorKind: "hermes",
      payload,
    });

    return execResult as unknown as Record<string, unknown>;
  },

  async get_resource_health(ctx, input) {
    const connKey = String(input.connectorKey);
    const connectorsClient = createConnectorsClient();
    const conn = await getConnectorConnection(connectorsClient as never, connKey, ctx.tenantId);
    const health = await resolveConnectorHealth(connectorsClient as never, connKey, conn, ctx.tenantId);

    return {
      connectorKey: connKey,
      status: health.status,
      health: {
        lastError: health.lastError,
        lastVerifiedAt: health.lastVerifiedAt,
        discoveredCapabilities: health.discoveredCapabilities,
        details: health.details,
      },
    };
  },

  async execute_core_mcp(ctx, input) {
    const capabilityKey = String(input.capabilityKey);
    const payload = (input.payload as Record<string, unknown>) ?? {};
    const confirmedByFounder = Boolean(input.confirmedByFounder);
    const channel = (input.channel as "whatsapp" | "telegram" | "web" | "admin") || "web";

    const result = await executeCoreMcpCapability(capabilityKey, payload, {
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      actorKind: "hermes",
      channel,
      confirmedByFounder,
    });

    return result as unknown as Record<string, unknown>;
  },

  async route_natural_language_command(ctx, input) {
    const command = String(input.command || input.query || "");
    const confirmedByFounder = Boolean(input.confirmedByFounder);
    const channel = (input.channel as "whatsapp" | "telegram" | "web" | "admin") || "web";

    const plan = decomposeNaturalLanguageIntent(command, {
      tenantId: ctx.tenantId,
      confirmedByFounder,
      channel,
    });

    const execution = await executeDecomposedPlan(plan.tasks, {
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      actorKind: "hermes",
      channel,
      confirmedByFounder,
    });

    return {
      rawQuery: plan.rawQuery,
      inferredIntent: plan.inferredIntent,
      planStatus: execution.planStatus,
      stepResults: execution.stepResults,
      overallMessage: execution.overallMessage,
      requiresFounderConfirmation: plan.requiresFounderConfirmation,
      confirmationPrompts: plan.confirmationPrompts,
    };
  },
};

export class ConnectorNotAuthorizedError extends Error {
  constructor(tool: string, reason: string) {
    const suffix =
      reason === "autonomy_approval_required_not_yet_auto_routed"
        ? " -- this capability requires Founder approval before use. Call request_approval (kind: 'other', subject explaining what you need and why) to ask now, then retry this exact tool call once it is approved. Do not give up or fabricate a result."
        : "";
    super(`Tool '${tool}' requires connector authorization the current mission does not have: ${reason}${suffix}`);
    this.name = "ConnectorNotAuthorizedError";
  }
}

const HERMES_TOOL_CONNECTOR_MAP: Partial<Record<ToolName, { connectorKey: string; capabilityKey: string }>> = {
  generate_image: { connectorKey: "gemini", capabilityKey: "media.image_generation" },
  check_domain_status: { connectorKey: "vercel", capabilityKey: "website.domain_status" },
  browser_navigate: { connectorKey: "founder_computer", capabilityKey: "browser.navigate" },
  browser_click: { connectorKey: "founder_computer", capabilityKey: "browser.click" },
  browser_type: { connectorKey: "founder_computer", capabilityKey: "browser.type" },
  browser_key: { connectorKey: "founder_computer", capabilityKey: "browser.key" },
  browser_scroll: { connectorKey: "founder_computer", capabilityKey: "browser.scroll" },
  browser_select: { connectorKey: "founder_computer", capabilityKey: "browser.select" },
  browser_wait: { connectorKey: "founder_computer", capabilityKey: "browser.wait" },
  browser_read: { connectorKey: "founder_computer", capabilityKey: "browser.read" },
  browser_screenshot: { connectorKey: "founder_computer", capabilityKey: "browser.screenshot" },
  browser_upload: { connectorKey: "founder_computer", capabilityKey: "browser.upload" },
  browser_download: { connectorKey: "founder_computer", capabilityKey: "browser.download" },
  browser_tabs: { connectorKey: "founder_computer", capabilityKey: "browser.tabs" },
  computer_open_app: { connectorKey: "founder_computer", capabilityKey: "computer.open_app" },
  computer_click: { connectorKey: "founder_computer", capabilityKey: "computer.click" },
  computer_type: { connectorKey: "founder_computer", capabilityKey: "computer.type" },
  computer_key: { connectorKey: "founder_computer", capabilityKey: "computer.key" },
  computer_screenshot: { connectorKey: "founder_computer", capabilityKey: "computer.screenshot" },
  computer_wait: { connectorKey: "founder_computer", capabilityKey: "computer.wait" },
};

export async function resolveToolConnectorGate(
  supabase: unknown,
  tool: ToolName,
  tenantId?: string | null,
  missionId?: string | null
): Promise<{ connectorKey: string; capabilityKey: string } | undefined> {
  if (tool === "generate_image") {
    try {
      const selection = await selectBestResource(supabase as never, {
        capabilityKey: "image.generate",
        tenantId: tenantId ?? null,
        missionId: missionId ?? null,
        requireAutonomous: true,
      });
      if (selection.selected) {
        return { connectorKey: selection.selected.connectorKey, capabilityKey: selection.selected.capabilityKey };
      }
    } catch {
      // Fail open to standard Gemini connector
    }
  }
  if (tool === "execute_capability") {
    return undefined; // Checked dynamically inside executeConnectorCapability
  }
  return HERMES_TOOL_CONNECTOR_MAP[tool];
}

export async function invokeTool(tool: ToolName, ctx: ToolCallContext, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (STRATXCEL_CONTROLLED_TOOLS.includes(tool)) throw new ToolNotAvailableError(tool);

  const handler = TOOL_HANDLERS[tool];
  if (!handler) throw new ToolNotAvailableError(tool);

  const auditClient = createAuditClient();
  const connectorsClient = createConnectorsClient();
  const connectorGate = await resolveToolConnectorGate(connectorsClient, tool);

  if (connectorGate) {
    const authz = await assertConnectorCapabilityAuthorized(connectorsClient as never, {
      ...connectorGate,
      tenantId: ctx.tenantId,
      missionId: ctx.missionId,
      actorKind: "hermes",
    });
    if (!authz.authorized) {
      await recordAuditEvent(auditClient, {
        tenantId: ctx.tenantId,
        actorKind: "hermes",
        action: `hermes.tool_call.${tool}.denied`,
        targetType: "mission",
        targetId: ctx.missionId,
        metadata: { correlationId: ctx.correlationId, connectorKey: connectorGate.connectorKey, capabilityKey: connectorGate.capabilityKey, reason: authz.reason },
      });
      throw new ConnectorNotAuthorizedError(tool, authz.reason);
    }
  }

  const result = await handler(ctx, input);

  await recordAuditEvent(auditClient, {
    tenantId: ctx.tenantId,
    actorKind: "hermes",
    action: `hermes.tool_call.${tool}`,
    targetType: "mission",
    targetId: ctx.missionId,
    metadata: { correlationId: ctx.correlationId },
  });

  return result;
}
