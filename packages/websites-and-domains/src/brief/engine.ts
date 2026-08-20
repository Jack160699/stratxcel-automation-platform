/**
 * Smart Website Brief Engine
 *
 * Transforms human-friendly multilingual customer messages (Hindi, Hinglish, English)
 * into precise, validated StructuredWebsiteBriefs and Master Prompts feeding the
 * Website Generation Engine.
 */

import type {
  StructuredWebsiteBrief,
  CustomerAnswer,
  AuthorizedConnectorContext,
  PreGenerationSummary,
  SmartQuestion,
  VisualStyle,
} from "./types.ts";
import { normalizeCustomerInput } from "./normalizer.ts";
import { buildStructuredWebsiteBrief, formatPreGenerationSummary } from "./brief-builder.ts";
import { compileMasterWebsitePrompt } from "./master-prompt.ts";
import { websiteGenerationEngine } from "../generation/engine.ts";
import type { GenerateWebsiteOutput } from "../generation/types.ts";

export interface ProcessBriefInput {
  tenantId: string;
  projectId?: string;
  message: string;
  answers?: CustomerAnswer[];
  connectorContext?: AuthorizedConnectorContext;
}

export type ProcessBriefResult =
  | {
      status: "NEED_MORE_INFO";
      questions: SmartQuestion[];
      currentBrief: StructuredWebsiteBrief;
      summary: PreGenerationSummary;
    }
  | {
      status: "READY";
      brief: StructuredWebsiteBrief;
      summary: PreGenerationSummary;
      masterPrompt: string;
      generatedSite?: GenerateWebsiteOutput;
    };

export interface RegenerationOptions {
  tenantId: string;
  projectId: string;
  instruction: string;
  previousBrief: StructuredWebsiteBrief;
  newStyle?: VisualStyle;
  addPages?: string[];
  newGoal?: string;
}

export class WebsiteBriefEngine {
  /**
   * Processes conversational customer input, asks smart questions when needed,
   * and generates the master prompt and website preview.
   */
  public async processCustomerInput(input: ProcessBriefInput): Promise<ProcessBriefResult> {
    const signals = normalizeCustomerInput(input.message);

    const brief = buildStructuredWebsiteBrief({
      tenantId: input.tenantId,
      projectId: input.projectId,
      signals,
      answers: input.answers,
      connectorContext: input.connectorContext,
    });

    const summary = formatPreGenerationSummary(brief);

    // If there are required unanswered questions and user hasn't provided answers yet
    if (!brief.isComplete && brief.unresolvedQuestions.length > 0) {
      return {
        status: "NEED_MORE_INFO",
        questions: brief.unresolvedQuestions,
        currentBrief: brief,
        summary,
      };
    }

    // Brief is complete: generate master prompt and invoke WebsiteGenerationEngine
    const masterPrompt = compileMasterWebsitePrompt(brief);

    const generatedSite = await websiteGenerationEngine.generate({
      tenantId: input.tenantId,
      projectId: input.projectId,
      prompt: masterPrompt,
      brandContext: {
        businessName: brief.businessName.value,
        businessCategory: brief.businessCategory.value,
        brandAesthetic: brief.visualStyle.value === "PREMIUM_LUXURY" ? "luxury" : "modern",
      },
    });

    return {
      status: "READY",
      brief,
      summary,
      masterPrompt,
      generatedSite,
    };
  }

  /**
   * Controlled safe regeneration: modifies specific design or goal parameters
   * while strictly preserving previous business context and version history.
   */
  public async regenerate(options: RegenerationOptions): Promise<ProcessBriefResult> {
    const updatedBrief: StructuredWebsiteBrief = {
      ...options.previousBrief,
      visualStyle: options.newStyle
        ? { value: options.newStyle, source: "customer_confirmed" }
        : options.previousBrief.visualStyle,
      requiredPages: options.addPages
        ? Array.from(new Set([...options.previousBrief.requiredPages, ...options.addPages]))
        : options.previousBrief.requiredPages,
      updatedAt: new Date().toISOString(),
    };

    const masterPrompt = compileMasterWebsitePrompt(updatedBrief);
    const summary = formatPreGenerationSummary(updatedBrief);

    const generatedSite = await websiteGenerationEngine.generate({
      tenantId: options.tenantId,
      projectId: options.projectId,
      prompt: `${masterPrompt}\n\n[REGENERATION INSTRUCTION]\n${options.instruction}`,
      brandContext: {
        businessName: updatedBrief.businessName.value,
        businessCategory: updatedBrief.businessCategory.value,
        brandAesthetic: updatedBrief.visualStyle.value === "PREMIUM_LUXURY" ? "luxury" : "modern",
      },
    });

    return {
      status: "READY",
      brief: updatedBrief,
      summary,
      masterPrompt,
      generatedSite,
    };
  }
}

export const websiteBriefEngine = new WebsiteBriefEngine();
