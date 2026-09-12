/**
 * Hermes CEO - Autonomous Executive Orchestration & Planning Engine
 * StratXcel Company Operating System
 *
 * Coordinates enterprise revenue operations, multi-agent fleet dispatch,
 * and company offer execution by decomposing directives into multi-department DAGs.
 */

import type { DepartmentKey } from "../departments/types.ts";

export type ExecutiveTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED";

export interface ExecutiveTask {
  id: string;
  title: string;
  department: DepartmentKey | string;
  assignedRole: string;
  objective: string;
  dependsOn?: string[];
  status: ExecutiveTaskStatus;
  estimatedMinutes?: number;
  expectedOutputs?: string[];
}

export interface ExecutivePlan {
  id: string;
  directive: string;
  tenantId: string;
  companyScope?: string;
  status: "PLANNED" | "EXECUTING" | "COMPLETED" | "PAUSED" | "FAILED";
  createdAt: string;
  tasks: ExecutiveTask[];
  targetOutcome?: string;
  estimatedRevenueImpactCents?: number;
}

export class HermesCeoPlanner {
  private generatePlanId(): string {
    return `plan-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Decomposes an executive directive into a multi-department directed acyclic graph (DAG)
   * with explicit task dependencies, assigned roles, and deliverables.
   */
  public decomposeDirective(
    directive: string,
    tenantId: string,
    options: { companyScope?: string; targetRevenueImpactCents?: number } = {}
  ): ExecutivePlan {
    const text = directive.toLowerCase();
    const planId = this.generatePlanId();
    const tasks: ExecutiveTask[] = [];

    const isSolar = text.includes("solar") || text.includes("photovoltaic") || text.includes("energy");
    const isAdmissions = text.includes("admission") || text.includes("university") || text.includes("student") || text.includes("college");

    // Task 1: Strategic Alignment & ICP Definition (Growth / Strategy)
    const task1Id = `task-${planId}-1`;
    tasks.push({
      id: task1Id,
      title: "Define ICP & Market Targeting Strategy",
      department: "growth",
      assignedRole: "growth_strategist",
      objective: `Establish ICP criteria, target geographic segments, and value proposition for: ${directive}`,
      status: "PENDING",
      estimatedMinutes: 45,
      expectedOutputs: ["icp_criteria_memo", "channel_priority_plan"],
    });

    // Task 2: Commercial Offer & Collateral Packaging (Content / Brand)
    const task2Id = `task-${planId}-2`;
    tasks.push({
      id: task2Id,
      title: "Package Commercial Offer & Value Proposition",
      department: "content",
      assignedRole: "copywriter",
      objective: isSolar
        ? "Draft commercial solar ROI pitch deck, site assessment criteria, and financing options."
        : isAdmissions
        ? "Draft academic admissions syllabus, accreditation verification, and student enrollment guides."
        : "Draft standard commercial proposal templates and pricing rate sheets.",
      dependsOn: [task1Id],
      status: "PENDING",
      estimatedMinutes: 60,
      expectedOutputs: ["offer_proposal_template", "outreach_scripts"],
    });

    // Task 3: Lead Discovery & Account Prospecting (Acquisition)
    const task3Id = `task-${planId}-3`;
    tasks.push({
      id: task3Id,
      title: isSolar
        ? "Commercial Prospect Discovery & Solar Energy Assessment"
        : "Prospect Discovery & ICP Lead Generation",
      department: "acquisition",
      assignedRole: isSolar ? "solara_solar_consultant" : "lead_gen_specialist",
      objective: isSolar
        ? "Identify manufacturing and industrial facilities with suitable rooftop area, obtain utility billing estimates, and stage DISCOVERED leads."
        : "Source and stage qualified target accounts in DISCOVERED stage according to ICP criteria.",
      dependsOn: [task1Id],
      status: "PENDING",
      estimatedMinutes: 90,
      expectedOutputs: ["qualified_lead_roster", "site_assessment_data"],
    });

    // Task 4: Commercial Qualification & Lead Nurturing (Acquisition)
    const task4Id = `task-${planId}-4`;
    tasks.push({
      id: task4Id,
      title: "Multi-Channel Outreach & Pipeline Conversion",
      department: "acquisition",
      assignedRole: isSolar ? "solara_solar_consultant" : "pipeline_conversion_specialist",
      objective: "Execute personalized WhatsApp, email, and direct executive outreach to advance leads through CONTACTED to CONVERTED.",
      dependsOn: [task2Id, task3Id],
      status: "PENDING",
      estimatedMinutes: 120,
      expectedOutputs: ["outreach_logs", "scheduled_consultations", "conversion_pipeline"],
    });

    // Task 5: Commercial Contract Review & Compliance (Finance / Quality)
    const task5Id = `task-${planId}-5`;
    tasks.push({
      id: task5Id,
      title: "Commercial Terms & Financial Assurance",
      department: "finance",
      assignedRole: "commercial_compliance_reviewer",
      objective: "Review margin targets, payment terms, and compliance guardrails prior to contract finalization.",
      dependsOn: [task4Id],
      status: "PENDING",
      estimatedMinutes: 30,
      expectedOutputs: ["financial_audit_stamp", "commercial_approval"],
    });

    return {
      id: planId,
      directive,
      tenantId,
      companyScope: options.companyScope || (isSolar ? "Solara Energy" : "StratXcel Enterprise"),
      status: "PLANNED",
      createdAt: new Date().toISOString(),
      tasks,
      targetOutcome: `Autonomous execution of: "${directive}" across ${tasks.length} coordinated agent milestones.`,
      estimatedRevenueImpactCents: options.targetRevenueImpactCents,
    };
  }
}

export * from "./hermes-executive-brain.ts";
