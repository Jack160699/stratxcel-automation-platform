/**
 * Autonomous Company Executive & Persistent Objective Ledger
 * StratXcel Autonomous Company OS - Hermes Brain
 *
 * Implements:
 * - Persistent Objective Ownership across the 35 Core Principles
 * - Multi-Objective Concurrency Management
 * - Durable Objective Tracking (Strategy, active missions, blockers, metrics, learning, history)
 * - Autonomous Re-planning & Self-Healing
 * - Synchronized Operating Record with Supabase & Notion
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hermesExecutiveBrain, type HermesCeoExecutionResult } from "./hermes-executive-brain.ts";
import {
  businessOpportunityUnderstanding,
  type BusinessOpportunityAnalysis,
} from "../understanding/business-opportunity-understanding.ts";

export interface HermesObjectiveRecord {
  id: string;
  tenantId: string;
  founderDirective: string;
  desiredOutcome: string;
  currentStrategy: string;
  opportunityAnalysis?: BusinessOpportunityAnalysis;
  activeMissionId: string;
  state: "PLANNING" | "ACTIVE" | "REPLANNING" | "COMPLETED" | "BLOCKED" | "PAUSED";
  acceptanceCriteria: {
    targetMetric: string;
    targetValue: number;
    currentValue: number;
    unit: string;
    isSatisfied: boolean;
  };
  metrics: {
    verifiedLeadsCount: number;
    pipelineValueInr: number;
    verifiedRevenueInr: number; // Only from payment provider!
  };
  activeBlockers: string[];
  learningLog: Array<{
    timestamp: string;
    insight: string;
    sourcePerformance?: Record<string, unknown>;
  }>;
  cycleHistory: Array<{
    cycleNumber: number;
    action: string;
    result: string;
    timestamp: string;
  }>;
  nextBestAction: string;
  createdAt: string;
  updatedAt: string;
}

export class AutonomousCompanyExecutive {
  private activeObjectives: Map<string, HermesObjectiveRecord> = new Map();

  private resolveSupabase(supabaseClient?: SupabaseClient | null) {
    if (supabaseClient) return supabaseClient;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
    if (url && key) {
      try {
        return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Accepts a natural language objective from the Founder and takes durable ownership.
   */
  public async acceptFounderObjective(
    directive: string,
    options: {
      tenantId: string;
      companyScope?: string;
      targetQuantity?: number;
      supabaseClient?: SupabaseClient | null;
      maxCycles?: number;
    }
  ): Promise<{
    objective: HermesObjectiveRecord;
    executionResult: HermesCeoExecutionResult;
    conversationalReply: string;
  }> {
    const objectiveId = `obj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const supabase = this.resolveSupabase(options.supabaseClient);

    // 1. Initial 12-Question Reasoning & Scoping
    const reasoning = hermesExecutiveBrain.conductExecutiveReasoning(directive, options);
    const research = hermesExecutiveBrain.synthesizeMarketResearch(directive);

    const initialObjective: HermesObjectiveRecord = {
      id: objectiveId,
      tenantId: options.tenantId,
      founderDirective: directive,
      desiredOutcome: reasoning.outcome,
      currentStrategy: reasoning.bestNextAction,
      activeMissionId: "",
      state: "ACTIVE",
      acceptanceCriteria: {
        targetMetric: reasoning.successMetric.metricName,
        targetValue: reasoning.successMetric.targetValue,
        currentValue: 0,
        unit: reasoning.successMetric.unit,
        isSatisfied: false,
      },
      metrics: {
        verifiedLeadsCount: 0,
        pipelineValueInr: 0,
        verifiedRevenueInr: 0,
      },
      activeBlockers: [],
      learningLog: [
        {
          timestamp: new Date().toISOString(),
          insight: `Initiated grounded market strategy for ${options.companyScope || "business"}. Target: ${reasoning.successMetric.targetValue} ${reasoning.successMetric.unit}.`,
        },
      ],
      cycleHistory: [],
      nextBestAction: "Execute multi-stage DAG with grounded real prospect discovery and provenance.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.activeObjectives.set(objectiveId, initialObjective);

    // 2. Dispatch Hermes Executive Closed Loop Execution
    const execResult = await hermesExecutiveBrain.executeExecutiveObjective(directive, {
      ...options,
      supabaseClient: supabase,
    });

    initialObjective.activeMissionId = execResult.missionId;
    initialObjective.acceptanceCriteria.currentValue = execResult.leadsSummary?.total || 0;
    initialObjective.acceptanceCriteria.isSatisfied = execResult.status === "COMPLETED";
    initialObjective.state = execResult.status === "COMPLETED" ? "COMPLETED" : "ACTIVE";
    initialObjective.metrics.verifiedLeadsCount = execResult.leadsSummary?.total || 0;
    initialObjective.metrics.pipelineValueInr = (execResult.revenueSummary?.pipelineCents || 0) / 100;
    initialObjective.metrics.verifiedRevenueInr = (execResult.revenueSummary?.closedCents || 0) / 100;
    initialObjective.opportunityAnalysis = execResult.opportunityAnalysis;

    // Record learning and cycle history
    for (const c of execResult.cycles) {
      initialObjective.cycleHistory.push({
        cycleNumber: c.cycleNumber,
        action: `Grounded Prospect Discovery & Qualification Cycle ${c.cycleNumber}`,
        result: `${c.metricCurrent}/${c.metricTarget} verified accounts (${c.progressPercentage}%)`,
        timestamp: new Date().toISOString(),
      });
    }

    initialObjective.updatedAt = new Date().toISOString();
    this.activeObjectives.set(objectiveId, initialObjective);

    // 3. Persist Objective in Supabase missions ledger metadata
    if (supabase) {
      try {
        await supabase.from("missions").update({
          metadata: {
            objectiveId,
            objectiveRecord: initialObjective,
          },
        }).eq("id", execResult.missionId);
      } catch (err) {
        console.warn("[AutonomousCompanyExecutive] Supabase update warning:", err);
      }
    }

    return {
      objective: initialObjective,
      executionResult: execResult,
      conversationalReply: execResult.overallMessage,
    };
  }

  /**
   * Applies continuous natural language Founder feedback to refine an active objective,
   * preserving conversational state and updating the strategy in-place without restarting context.
   */
  public async refineObjectiveWithFounderFeedback(
    objectiveId: string,
    feedbackText: string,
    options: { supabaseClient?: SupabaseClient | null } = {}
  ): Promise<{
    objective: HermesObjectiveRecord;
    appliedChanges: string[];
    conversationalReply: string;
  }> {
    const objective = this.activeObjectives.get(objectiveId);
    if (!objective) {
      throw new Error(`Objective '${objectiveId}' not found in persistent ledger.`);
    }

    if (!objective.opportunityAnalysis) {
      objective.opportunityAnalysis = businessOpportunityUnderstanding.understandOpportunity(objective.founderDirective, {
        tenantId: objective.tenantId,
      });
    }

    const refined = businessOpportunityUnderstanding.refineOpportunityWithFeedback(
      objective.opportunityAnalysis,
      feedbackText
    );

    objective.opportunityAnalysis = refined;
    objective.currentStrategy = refined.operatingStrategy.firstAction;
    objective.nextBestAction = refined.operatingStrategy.subsequentActions[0] || objective.nextBestAction;
    objective.updatedAt = new Date().toISOString();

    const lastAmendment = refined.amendments[refined.amendments.length - 1];
    const appliedChanges = lastAmendment?.appliedChanges || [`Applied directive: "${feedbackText}"`];

    objective.learningLog.push({
      timestamp: new Date().toISOString(),
      insight: `Founder Feedback Applied: "${feedbackText}". Strategy updated: ${appliedChanges.join(" | ")}`,
    });

    const reply =
      `Hermes CEO: Understood. I have updated the operating strategy for "${objective.founderDirective}":\n` +
      appliedChanges.map((c) => `• ${c}`).join("\n") +
      `\nNext Action: ${objective.nextBestAction}`;

    const supabase = this.resolveSupabase(options.supabaseClient);
    if (supabase && objective.activeMissionId) {
      try {
        await supabase.from("missions").update({
          metadata: {
            objectiveId,
            objectiveRecord: objective,
          },
        }).eq("id", objective.activeMissionId);

        await supabase.from("mission_events").insert({
          id: crypto.randomUUID(),
          mission_id: objective.activeMissionId,
          event_type: "hermes_objective_refined",
          payload: {
            feedbackText,
            appliedChanges,
            updatedStrategy: objective.currentStrategy,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn("[AutonomousCompanyExecutive] Failed to sync amendment:", err);
      }
    }

    return {
      objective,
      appliedChanges,
      conversationalReply: reply,
    };
  }

  /**
   * Retrieves active objective records for a tenant.
   */
  public getActiveObjectives(tenantId: string): HermesObjectiveRecord[] {
    return Array.from(this.activeObjectives.values()).filter((obj) => obj.tenantId === tenantId);
  }

  /**
   * Retrieves an objective by ID.
   */
  public getObjective(objectiveId: string): HermesObjectiveRecord | undefined {
    return this.activeObjectives.get(objectiveId);
  }
}

export const autonomousCompanyExecutive = new AutonomousCompanyExecutive();
