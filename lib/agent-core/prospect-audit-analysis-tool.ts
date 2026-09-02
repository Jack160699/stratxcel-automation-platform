/**
 * run_prospect_audit_analysis: a real, honest first automated slice of
 * capability:prospect_audit_automated_pipeline, recorded NOT_BUILT in
 * Update 58 -- confirmed then that the free/prospect Audit product
 * (public_audit_requests) had no automated generation pipeline at all,
 * entirely staff-worked by hand.
 *
 * Deliberately NOT the same thing as the paid audit_orders engine
 * (packages/audit-engine's multi-stage QUEUED->RESEARCH->ANALYSIS->
 * QUALITY_GATE->DELIVERY pipeline with AI receipts and budget tracking) --
 * building that for the free tier is a distinct, larger task, and this
 * pass stays honest about not claiming to be that. What this IS: the
 * exact same real, already-live, already-cached website intelligence
 * pipeline analyze_website uses (lib/agent-core/website-intelligence-cache.ts's
 * runWebsiteIntelligencePipelineCached -- real crawl, real SSRF protection,
 * real evidence-tagged extraction, 24h cache), triggered on demand for one
 * specific submitted public_audit_requests row and saved as that row's
 * real job_status/report_data/evidence_data -- turning "100% manual" into
 * "a real automated first-pass analysis a staff member triggers and
 * reviews," not a fully unattended pipeline (which this codebase's own
 * Vercel Hobby-plan cron ceiling -- capability:vercel_cron_hobby_tier_daily_cap,
 * Update 58 -- would bound to once-daily anyway, even if built).
 *
 * Deliberately does NOT touch the request's own `status` column (the CRM
 * pipeline stage: new/contacted/qualified/.../completed/converted/rejected)
 * -- that stays a human sales-process decision, never auto-advanced by
 * this tool. Only the job_status/progress_percentage/report_data/
 * evidence_data/error_message/started_at/completed_at "job" fields are
 * written.
 */
import type { AgentTool } from "@stratxcel/agent-core";
import { runWebsiteIntelligencePipelineCached } from "./website-intelligence-cache";

const ANALYZE_MAX_PAGES = 6;

export const RUN_PROSPECT_AUDIT_ANALYSIS_TOOL: AgentTool = {
  schema: {
    name: "run_prospect_audit_analysis",
    description:
      "Runs a real, automated website analysis for a submitted free/prospect Audit request and saves it as that request's real job result -- the same real website intelligence pipeline analyze_website uses. Turns a manual-only prospect audit into a real automated first-pass analysis a staff member can review and deliver. Use for 'run the audit for this prospect', 'analyze this audit request'. Requires the request to have a real website URL.",
    parameters: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "A real public_audit_requests id." },
      },
      required: ["requestId"],
    },
  },
  mutating: true,
  risk: "low_mutation",
  requiredPermission: "agent:mutate:audit_reports",
  async execute(ctx, args) {
    const requestId = typeof args.requestId === "string" ? args.requestId.trim() : "";
    if (!requestId) return { outcome: "FAILED", reason: "missing_request_id" };

    const supabase = ctx.supabase as never as {
      from(table: string): {
        select(columns: string): { eq(column: string, value: string): { maybeSingle(): Promise<{ data: { id: string; business_name: string; website_url: string | null } | null }> } };
        update(row: Record<string, unknown>): { eq(column: string, value: string): Promise<{ error: { message: string } | null }> };
      };
    };

    const { data: request } = await supabase.from("public_audit_requests").select("id, business_name, website_url").eq("id", requestId).maybeSingle();
    if (!request) return { outcome: "FAILED", reason: "request_not_found" };
    if (!request.website_url) return { outcome: "FAILED", reason: "no_website_url_on_request" };

    await supabase.from("public_audit_requests").update({ job_status: "processing", started_at: new Date().toISOString(), error_message: null }).eq("id", requestId);

    try {
      const { intelligence, cacheHit } = await runWebsiteIntelligencePipelineCached(ctx.supabase as never, request.website_url, { maxPages: ANALYZE_MAX_PAGES });
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("public_audit_requests")
        .update({
          job_status: "completed",
          progress_percentage: 100,
          report_data: intelligence,
          evidence_data: [{ source: "website_intelligence_pipeline", cacheHit, retrievedAt: nowIso }],
          completed_at: nowIso,
        })
        .eq("id", requestId);
      if (error) return { outcome: "FAILED", reason: error.message };
      return { outcome: "COMPLETED", requestId, businessName: request.business_name, cacheHit };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "analysis_failed";
      await supabase.from("public_audit_requests").update({ job_status: "failed", error_message: reason.slice(0, 500) }).eq("id", requestId);
      return { outcome: "FAILED", reason };
    }
  },
  interpretOutcome(result) {
    const r = result as { outcome?: string; reason?: string } | null;
    if (r?.outcome === "COMPLETED") return null;
    return { status: "failed", detail: r?.reason };
  },
};
