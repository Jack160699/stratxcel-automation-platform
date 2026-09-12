/**
 * Excel Writer — Spreadsheet Operations
 *
 * Generates real .xlsx files from real DB data.
 * Logs every operation to spreadsheet_operations table.
 * Google Sheets: only attempted if OAuth is valid.
 * Falls back to local .xlsx if Google Sheets is unavailable.
 * Never claims success without a verified write.
 */

import ExcelJS from "exceljs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

export interface WriteResult {
  ok: boolean;
  provider: "local_xlsx" | "google_sheets";
  fileRef?: string;
  rowsWritten: number;
  error?: string;
}

export class ExcelWriter {
  private sb: SupabaseClient;
  private outputDir: string;

  constructor(supabaseUrl: string, serviceRoleKey: string, outputDir: string = "./tmp/spreadsheets") {
    this.sb = createClient(supabaseUrl, serviceRoleKey);
    this.outputDir = outputDir;
  }

  private ensureDir() {
    if (!existsSync(this.outputDir)) mkdirSync(this.outputDir, { recursive: true });
  }

  private async logOperation(
    tenantId: string,
    target: string,
    provider: string,
    status: "success" | "failed" | "skipped",
    rowsAffected: number,
    fileRef?: string,
    error?: string,
    missionId?: string
  ) {
    try {
      await this.sb.from("spreadsheet_operations").insert({
        tenant_id: tenantId,
        mission_id: missionId ?? null,
        operation_type: "write",
        target,
        rows_affected: rowsAffected,
        provider,
        file_ref: fileRef ?? null,
        status,
        error: error ?? null,
        executed_by: "excel_writer",
      });
    } catch {
      // Non-blocking if table not yet migrated
    }

    if (missionId) {
      try {
        await this.sb.from("mission_events").insert({
          id: crypto.randomUUID(),
          mission_id: missionId,
          event_type: "spreadsheet_operation",
          payload: {
            target,
            provider,
            status,
            rows_affected: rowsAffected,
            file_ref: fileRef ?? null,
            error: error ?? null,
          },
        });
      } catch {
        // Non-blocking
      }
    }
  }

  /** Write the lead pipeline to a local .xlsx file. */
  async writeLeadPipeline(tenantId: string, missionId?: string): Promise<WriteResult> {
    this.ensureDir();
    const filename = `lead-pipeline-${tenantId.substring(0, 8)}-${Date.now()}.xlsx`;
    const filePath = join(this.outputDir, filename);

    // Fetch real leads from DB
    const { data: leads, error } = await this.sb
      .from("crm_leads")
      .select("contact_name, company_name, status, icp_match_score, source, next_follow_up_at, last_interaction_at, notes, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      await this.logOperation(tenantId, "lead_pipeline", "local_xlsx", "failed", 0, undefined, error.message, missionId);
      return { ok: false, provider: "local_xlsx", rowsWritten: 0, error: error.message };
    }

    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Lead Pipeline");
      ws.columns = [
        { header: "Name", key: "contact_name", width: 20 },
        { header: "Company", key: "company_name", width: 20 },
        { header: "Stage", key: "status", width: 14 },
        { header: "ICP Score", key: "icp_match_score", width: 10 },
        { header: "Source", key: "source", width: 16 },
        { header: "Next Follow Up", key: "next_follow_up_at", width: 18 },
        { header: "Last Interaction", key: "last_interaction_at", width: 18 },
        { header: "Notes", key: "notes", width: 30 },
        { header: "Created", key: "created_at", width: 18 },
      ];
      ws.getRow(1).font = { bold: true };

      const rows = leads ?? [];
      for (const row of rows) {
        ws.addRow({
          contact_name: row.contact_name ?? "",
          company_name: row.company_name ?? "",
          status: row.status,
          icp_match_score: row.icp_match_score ?? "",
          source: row.source,
          next_follow_up_at: row.next_follow_up_at ? new Date(row.next_follow_up_at).toLocaleDateString() : "",
          last_interaction_at: row.last_interaction_at ? new Date(row.last_interaction_at).toLocaleDateString() : "",
          notes: row.notes ?? "",
          created_at: new Date(row.created_at).toLocaleDateString(),
        });
      }

      await wb.xlsx.writeFile(filePath);
      await this.logOperation(tenantId, "lead_pipeline", "local_xlsx", "success", rows.length, filePath, undefined, missionId);
      return { ok: true, provider: "local_xlsx", fileRef: filePath, rowsWritten: rows.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logOperation(tenantId, "lead_pipeline", "local_xlsx", "failed", 0, undefined, msg, missionId);
      return { ok: false, provider: "local_xlsx", rowsWritten: 0, error: msg };
    }
  }

  /** Write revenue pipeline to a local .xlsx file. */
  async writeRevenuePipeline(tenantId: string, missionId?: string): Promise<WriteResult> {
    this.ensureDir();
    const filename = `revenue-pipeline-${tenantId.substring(0, 8)}-${Date.now()}.xlsx`;
    const filePath = join(this.outputDir, filename);

    const { data: missions, error } = await this.sb
      .from("revenue_missions")
      .select("objective, target_revenue_cents, revenue_cents, costs_cents, target_leads, current_state, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      await this.logOperation(tenantId, "revenue_pipeline", "local_xlsx", "failed", 0, undefined, error.message, missionId);
      return { ok: false, provider: "local_xlsx", rowsWritten: 0, error: error.message };
    }

    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Revenue Pipeline");
      ws.columns = [
        { header: "Objective", key: "objective", width: 30 },
        { header: "Target Revenue", key: "target_revenue_cents", width: 16 },
        { header: "Actual Revenue", key: "revenue_cents", width: 16 },
        { header: "Costs", key: "costs_cents", width: 12 },
        { header: "Target Leads", key: "target_leads", width: 12 },
        { header: "State", key: "current_state", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Started", key: "created_at", width: 18 },
      ];
      ws.getRow(1).font = { bold: true };

      const rows = missions ?? [];
      for (const row of rows) {
        ws.addRow({
          objective: row.objective,
          target_revenue_cents: row.target_revenue_cents != null ? (row.target_revenue_cents / 100).toFixed(2) : "",
          revenue_cents: (row.revenue_cents / 100).toFixed(2),
          costs_cents: (row.costs_cents / 100).toFixed(2),
          target_leads: row.target_leads ?? "",
          current_state: row.current_state,
          status: row.status,
          created_at: new Date(row.created_at).toLocaleDateString(),
        });
      }

      await wb.xlsx.writeFile(filePath);
      await this.logOperation(tenantId, "revenue_pipeline", "local_xlsx", "success", rows.length, filePath, undefined, missionId);
      return { ok: true, provider: "local_xlsx", fileRef: filePath, rowsWritten: rows.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logOperation(tenantId, "revenue_pipeline", "local_xlsx", "failed", 0, undefined, msg, missionId);
      return { ok: false, provider: "local_xlsx", rowsWritten: 0, error: msg };
    }
  }

  /** Write a KPI report for a list of agents. */
  async writeKpiReport(
    tenantId: string,
    kpis: Array<Record<string, unknown>>,
    missionId?: string
  ): Promise<WriteResult> {
    this.ensureDir();
    const filename = `kpi-report-${tenantId.substring(0, 8)}-${Date.now()}.xlsx`;
    const filePath = join(this.outputDir, filename);

    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Agent KPIs");
      ws.columns = [
        { header: "Agent", key: "agentId", width: 22 },
        { header: "Leads Discovered", key: "leadsDiscovered", width: 16 },
        { header: "Leads Qualified", key: "leadsQualified", width: 16 },
        { header: "Missions Completed", key: "missionsCompleted", width: 18 },
        { header: "Revenue Influenced", key: "revenueInfluenced", width: 18 },
        { header: "Deals Won", key: "dealsWon", width: 12 },
        { header: "Success Rate %", key: "successRate", width: 14 },
        { header: "Last Active", key: "lastActiveAt", width: 18 },
      ];
      ws.getRow(1).font = { bold: true };

      for (const kpi of kpis) {
        ws.addRow({
          agentId: kpi.agentId,
          leadsDiscovered: kpi.leadsDiscovered,
          leadsQualified: kpi.leadsQualified,
          missionsCompleted: kpi.missionsCompleted,
          revenueInfluenced: ((Number(kpi.revenueInfluencedCents ?? 0)) / 100).toFixed(2),
          dealsWon: kpi.dealsWon,
          successRate: (Number(kpi.successRate ?? 0) * 100).toFixed(1) + "%",
          lastActiveAt: kpi.lastActiveAt ? new Date(kpi.lastActiveAt as string).toLocaleDateString() : "",
        });
      }

      await wb.xlsx.writeFile(filePath);
      await this.logOperation(tenantId, "kpi_tracker", "local_xlsx", "success", kpis.length, filePath, undefined, missionId);
      return { ok: true, provider: "local_xlsx", fileRef: filePath, rowsWritten: kpis.length };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.logOperation(tenantId, "kpi_tracker", "local_xlsx", "failed", 0, undefined, msg, missionId);
      return { ok: false, provider: "local_xlsx", rowsWritten: 0, error: msg };
    }
  }
}

export async function logSpreadsheetOperation(
  params: {
    tenantId: string;
    missionId?: string;
    operationType?: string;
    targetSheetName: string;
    rowsWritten: number;
    columnsWritten?: number;
    fileSizeBytes?: number;
    status: "COMPLETED" | "FAILED" | "SKIPPED";
    fileRef?: string;
    error?: string;
  },
  supabase?: any
): Promise<void> {
  if (supabase) {
    try {
      await supabase.from("spreadsheet_operations").insert({
        tenant_id: params.tenantId,
        mission_id: params.missionId ?? null,
        operation_type: params.operationType || "write",
        target: params.targetSheetName,
        rows_affected: params.rowsWritten,
        provider: "local_xlsx",
        file_ref: params.fileRef ?? null,
        status: params.status.toLowerCase(),
        error: params.error ?? null,
        executed_by: "excel_writer",
      });
    } catch {
      // Non-blocking fallback
    }

    if (params.missionId) {
      try {
        await supabase.from("mission_events").insert({
          id: crypto.randomUUID(),
          mission_id: params.missionId,
          event_type: "spreadsheet_operation",
          payload: {
            target: params.targetSheetName,
            rowsWritten: params.rowsWritten,
            columnsWritten: params.columnsWritten,
            status: params.status,
            fileSizeBytes: params.fileSizeBytes,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        // Non-blocking
      }
    }
  }
}

