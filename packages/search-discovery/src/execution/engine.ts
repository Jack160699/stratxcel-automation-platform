import { createHash } from "node:crypto";
import type { SearchDb } from "../repository.ts";
import type { CMSExecutionProvider, CMSVerificationSpec } from "./cms/types.ts";
import { precheckSearchActionExecution } from "./policy.ts";

export interface ExecutionEngineDeps {
  db: SearchDb;
  cmsProvider: CMSExecutionProvider;
  recordAudit?: (event: {
    tenantId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}

export interface ExecuteActionInput {
  tenantId: string;
  actionId: string;
  actorUserId?: string;
  overrideSpec?: CMSVerificationSpec;
  idempotencyKey?: string;
}

export interface ExecutionEngineResult {
  status: "COMPLETED" | "VERIFIED" | "FAILED" | "BLOCKED" | "VERIFICATION_FAILED";
  actionId: string;
  targetUrl: string;
  beforeEvidence?: Record<string, unknown>;
  afterEvidence?: Record<string, unknown>;
  verificationResult?: Record<string, unknown>;
  errorMessage?: string;
  blockerCode?: string;
}

/**
 * Server-side Search Action Execution Engine.
 * Enforces strict capability verification, records before/after evidence,
 * validates live publication with automated verification, and records value ledger deliverables.
 */
export async function executeSearchAction(
  deps: ExecutionEngineDeps,
  input: ExecuteActionInput
): Promise<ExecutionEngineResult> {
  const now = new Date().toISOString();
  const db = deps.db;

  // 1. Fetch Action Details
  const actionRes = await db
    .from("search_actions")
    .select("*, search_recommendations(*, search_opportunities(*, search_projects(*)))")
    .eq("id", input.actionId)
    .eq("tenant_id", input.tenantId)
    .single();

  if (actionRes.error || !actionRes.data) {
    return {
      status: "BLOCKED",
      actionId: input.actionId,
      targetUrl: "",
      blockerCode: "ACTION_NOT_FOUND",
      errorMessage: `Search action ${input.actionId} not found for this tenant.`,
    };
  }

  const action = actionRes.data;
  const rec = action.search_recommendations;
  const opp = rec?.search_opportunities;
  const project = opp?.search_projects;

  const targetUrl = action.target_url || rec?.proposed_change?.affectedUrl || project?.property_url || deps.cmsProvider.siteUrl;
  const proposedChange = typeof rec?.proposed_change?.recommendation === "string" ? rec.proposed_change.recommendation : "Optimize SEO elements";
  const actionClass = action.action_class || "safe_preparatory";

  // Prevent re-executing already completed actions
  if (action.state === "COMPLETED" || action.execution_state === "VERIFIED") {
    return {
      status: "VERIFIED",
      actionId: input.actionId,
      targetUrl,
      beforeEvidence: action.before_evidence,
      afterEvidence: action.after_evidence,
      verificationResult: action.verification_result,
    };
  }

  // 2. Fetch Subscription & Entitlements
  const subRes = await db
    .from("subscriptions")
    .select("plan_tier, status")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planTier = subRes.data?.plan_tier || "free";
  const subStatus = subRes.data?.status || "inactive";

  // 3. Check Connector Status
  const cmsStatus = await deps.cmsProvider.status();
  const isHealthy = cmsStatus === "WRITE_AVAILABLE" || cmsStatus === "READ_ONLY";
  const writeEnabled = cmsStatus === "WRITE_AVAILABLE";

  // 4. Validate Target Domain Match
  let targetDomainMatch = true;
  try {
    const targetHost = new URL(targetUrl).hostname.toLowerCase().replace(/^www\./, "");
    const allowedHost1 = project?.property_url ? new URL(project.property_url).hostname.toLowerCase().replace(/^www\./, "") : "";
    const allowedHost2 = deps.cmsProvider.siteUrl ? new URL(deps.cmsProvider.siteUrl).hostname.toLowerCase().replace(/^www\./, "") : "";

    if (allowedHost1 && allowedHost2) {
      targetDomainMatch = targetHost === allowedHost1 || targetHost === allowedHost2;
    } else if (allowedHost1) {
      targetDomainMatch = targetHost === allowedHost1;
    } else if (allowedHost2) {
      targetDomainMatch = targetHost === allowedHost2;
    }
  } catch {
    targetDomainMatch = false;
  }

  // 5. Precheck Execution Allowed
  const precheck = precheckSearchActionExecution({
    tenantId: input.tenantId,
    planTier,
    subscriptionStatus: subStatus,
    isActionApproved: action.state === "APPROVED" || actionClass === "safe_preparatory",
    actionClass,
    proposedChange,
    connectorStatus: { isHealthy, writeEnabled, cmsType: deps.cmsProvider.cmsType },
    targetDomainMatch,
  });

  if (!precheck.allowed) {
    await db
      .from("search_actions")
      .update({
        state: "FAILED",
        execution_state: "BLOCKED",
        error_message: precheck.blockerReason,
        updated_at: now,
      })
      .eq("id", input.actionId)
      .eq("tenant_id", input.tenantId);

    return {
      status: "BLOCKED",
      actionId: input.actionId,
      targetUrl,
      blockerCode: precheck.blockerCode,
      errorMessage: precheck.blockerReason,
    };
  }

  // 5. Update State to RUNNING
  await db
    .from("search_actions")
    .update({
      state: "IN_PROGRESS",
      execution_state: "RUNNING",
      started_at: now,
      execution_tool: `${deps.cmsProvider.cmsType}_cms_adapter`,
      agent_role: "seo-execution-agent",
      idempotency_key: input.idempotencyKey ?? null,
      updated_at: now,
    })
    .eq("id", input.actionId)
    .eq("tenant_id", input.tenantId);

  // 6. Capture BEFORE State
  let beforeState: Record<string, unknown> = {};
  try {
    const pageBefore = await deps.cmsProvider.readPage(targetUrl);
    beforeState = {
      title: pageBefore.title,
      metaDescription: pageBefore.metaDescription,
      canonicalUrl: pageBefore.canonicalUrl,
      schemaJsonLd: pageBefore.schemaJsonLd,
      capturedAt: new Date().toISOString(),
    };
  } catch (err) {
    beforeState = { error: err instanceof Error ? err.message : "Before state unreadable", capturedAt: new Date().toISOString() };
  }

  // 7. Execute Requested Mutation
  let mutationResult: Record<string, unknown> = {};
  let expectedSpec: CMSVerificationSpec = input.overrideSpec || {};

  try {
    if (/schema/i.test(proposedChange)) {
      const sampleSchema = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": project?.name || "Local Business",
        "url": targetUrl,
      };
      const result = await deps.cmsProvider.updateSchema(targetUrl, sampleSchema);
      mutationResult = result as any;
      expectedSpec = { expectedSchemaType: "LocalBusiness", ...expectedSpec };
    } else if (/page/i.test(proposedChange) && /create|new/i.test(proposedChange)) {
      const slug = proposedChange.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const result = await deps.cmsProvider.createPage({
        title: proposedChange,
        slug,
        bodyHtml: `<section><h1>${proposedChange}</h1><p>Verified service delivery page.</p></section>`,
      });
      mutationResult = result as any;
      expectedSpec = { expectedTitle: proposedChange, ...expectedSpec };
    } else {
      // Default: Metadata Title / Description Update
      const newTitle = `${proposedChange} | ${project?.name || "Official"}`;
      const result = await deps.cmsProvider.updateMetadata(targetUrl, {
        title: newTitle,
        description: `Verified ${proposedChange} for customers.`,
      });
      mutationResult = result as any;
      expectedSpec = { expectedTitle: proposedChange, ...expectedSpec };
    }
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : "Mutation execution failed";
    await db
      .from("search_actions")
      .update({
        state: "FAILED",
        execution_state: "FAILED",
        before_evidence: beforeState,
        error_message: errMessage,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.actionId)
      .eq("tenant_id", input.tenantId);

    return {
      status: "FAILED",
      actionId: input.actionId,
      targetUrl,
      beforeEvidence: beforeState,
      errorMessage: errMessage,
    };
  }

  // 8. Capture AFTER State & Run Verification
  const verification = await deps.cmsProvider.verifyPage(targetUrl, expectedSpec);

  if (!verification.verified) {
    // Attempt automated rollback on verification failure
    try {
      if ((mutationResult as any).pageId) {
        await deps.cmsProvider.rollbackPage((mutationResult as any).pageId, beforeState);
      }
    } catch {
      // Rollback attempted
    }

    const failReason = verification.failureReason || "Live HTML verification check failed";
    await db
      .from("search_actions")
      .update({
        state: "FAILED",
        execution_state: "VERIFICATION_FAILED",
        before_evidence: beforeState,
        after_evidence: mutationResult,
        verification_status: "VERIFICATION_FAILED",
        verification_result: verification as any,
        error_message: failReason,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.actionId)
      .eq("tenant_id", input.tenantId);

    return {
      status: "VERIFICATION_FAILED",
      actionId: input.actionId,
      targetUrl,
      beforeEvidence: beforeState,
      afterEvidence: mutationResult,
      verificationResult: verification as any,
      errorMessage: failReason,
    };
  }

  // 9. Mark COMPLETED & VERIFIED
  const completedAt = new Date().toISOString();
  await db
    .from("search_actions")
    .update({
      state: "COMPLETED",
      execution_state: "VERIFIED",
      before_evidence: beforeState,
      after_evidence: mutationResult,
      execution_result: { success: true, method: deps.cmsProvider.cmsType },
      verification_status: "VERIFIED",
      verification_result: verification as any,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq("id", input.actionId)
    .eq("tenant_id", input.tenantId);

  if (opp?.id) {
    await db
      .from("search_opportunities")
      .update({ status: "RESOLVED", resolved_at: completedAt, updated_at: completedAt })
      .eq("id", opp.id)
      .eq("tenant_id", input.tenantId);
  }

  // 10. Record Customer Value Ledger Entry
  const cycleMonth = completedAt.slice(0, 7);
  try {
    await db.from("value_ledger").insert({
      tenant_id: input.tenantId,
      cycle_month: cycleMonth,
      service_key: "search_growth_execution",
      deliverable_title: `Automated Search SEO Optimization: ${proposedChange.slice(0, 80)}`,
      deliverable_summary: `Executed on ${deps.cmsProvider.cmsType} for ${targetUrl}. Verified live with 200 HTTP status and DOM inspection.`,
      artifact_ref: targetUrl,
      result_metric: "verification_status",
      result_value: "VERIFIED",
      customer_visible: true,
    });
  } catch {
    // Value ledger insertion is non-blocking
  }

  // 11. Record Audit Event
  if (deps.recordAudit) {
    await deps.recordAudit({
      tenantId: input.tenantId,
      action: "SEARCH_ACTION_EXECUTED_AND_VERIFIED",
      targetType: "search_action",
      targetId: input.actionId,
      metadata: { targetUrl, cmsType: deps.cmsProvider.cmsType, verified: true },
    });
  }

  return {
    status: "VERIFIED",
    actionId: input.actionId,
    targetUrl,
    beforeEvidence: beforeState,
    afterEvidence: mutationResult,
    verificationResult: verification as any,
  };
}
