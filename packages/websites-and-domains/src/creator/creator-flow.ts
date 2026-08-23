/**
 * Customer-Facing Smart Website Creator State Machine & Controller
 *
 * Provides pure state transitions for conversational prompt input, dynamic questions,
 * known data indicators, pre-generation summaries, generation progress, and regeneration.
 */

import type {
  CreatorSessionState,
  CreatorFlowStep,
  GenerationStage,
  RegenerateOptionItem,
} from "./types.ts";
import { DEFAULT_GENERATION_STAGES } from "./types.ts";
import { normalizeCustomerInput } from "../brief/normalizer.ts";
import { planSmartQuestions } from "../brief/question-generator.ts";
import { buildStructuredWebsiteBrief, formatPreGenerationSummary } from "../brief/brief-builder.ts";
import { compileMasterWebsitePrompt } from "../brief/master-prompt.ts";
import { websiteGenerationEngine } from "../generation/engine.ts";
import type {
  AuthorizedConnectorContext,
  CustomerAnswer,
  BriefVisualStyle,
  StructuredWebsiteBrief,
} from "../brief/types.ts";

export class SmartWebsiteCreatorController {
  /**
   * Initializes a fresh or resumed creation session.
   */
  public initializeSession(params: {
    tenantId: string;
    projectId?: string;
    connectorContext?: AuthorizedConnectorContext;
    savedState?: Partial<CreatorSessionState>;
  }): CreatorSessionState {
    const { tenantId, projectId, connectorContext, savedState } = params;

    const knownFields: Array<{ label: string; value: string; source: string }> = [];
    const connectorChips: string[] = [];

    if (connectorContext?.brandBrain?.businessName) {
      knownFields.push({
        label: "Business Name",
        value: connectorContext.brandBrain.businessName,
        source: "From your Brand Brain profile",
      });
      connectorChips.push("Brand Brain Profile");
    }

    if (connectorContext?.brandBrain?.logoUrl) {
      knownFields.push({
        label: "Logo",
        value: "Uploaded",
        source: "Using your existing brand asset",
      });
    }

    if (connectorContext?.analytics?.connected) {
      connectorChips.push(
        `Google Analytics (${connectorContext.analytics.mobileTrafficPercentage || 80}% mobile)`
      );
    }

    if (connectorContext?.searchConsole?.connected) {
      connectorChips.push("Google Search Console");
    }

    if (connectorContext?.crm?.connected) {
      connectorChips.push("CRM & Leads");
    }

    if (connectorContext?.catalog?.existingProducts?.length) {
      connectorChips.push(`Product Catalog (${connectorContext.catalog.existingProducts.length} items)`);
    }

    const stages: GenerationStage[] = DEFAULT_GENERATION_STAGES.map((s, idx) => ({
      id: s.id,
      label: s.label,
      isComplete: false,
      isActive: idx === 0,
    }));

    if (savedState && savedState.step && savedState.step !== "INPUT") {
      return {
        sessionId: savedState.sessionId || `sess_${Date.now()}`,
        tenantId,
        projectId: projectId || savedState.projectId,
        step: savedState.step,
        currentQuestionIndex: savedState.currentQuestionIndex || 0,
        initialMessage: savedState.initialMessage || "",
        detectedLanguage: savedState.detectedLanguage || "en",
        selectedLanguage: savedState.selectedLanguage || "english",
        answers: savedState.answers || [],
        questions: savedState.questions || [],
        connectorContext,
        knownFields,
        connectorChips,
        brief: savedState.brief,
        summary: savedState.summary,
        generatedSite: savedState.generatedSite,
        currentStageIndex: savedState.currentStageIndex || 0,
        stages,
        canResume: true,
        completionPercentage: savedState.completionPercentage || 50,
        lastSavedAt: new Date().toISOString(),
      };
    }

    return {
      sessionId: `sess_${Date.now()}`,
      tenantId,
      projectId,
      step: "INPUT",
      currentQuestionIndex: 0,
      initialMessage: "",
      detectedLanguage: "en",
      selectedLanguage: "english",
      answers: [],
      questions: [],
      connectorContext,
      knownFields,
      connectorChips,
      currentStageIndex: 0,
      stages,
      canResume: false,
      completionPercentage: 0,
      lastSavedAt: new Date().toISOString(),
    };
  }

  /**
   * Processes the customer's conversational message (Hindi, Hinglish, English).
   */
  public submitInitialMessage(
    state: CreatorSessionState,
    message: string,
    siteLanguage: "english" | "hindi" | "bilingual" = "english"
  ): CreatorSessionState {
    const signals = normalizeCustomerInput(message);
    const questions = planSmartQuestions(signals, state.connectorContext);

    const newState: CreatorSessionState = {
      ...state,
      initialMessage: message,
      detectedLanguage: signals.detectedLanguage,
      selectedLanguage: siteLanguage,
      questions,
      currentQuestionIndex: 0,
      lastSavedAt: new Date().toISOString(),
    };

    // If no questions are needed (all context known), proceed directly to SUMMARY
    if (questions.length === 0) {
      const brief = buildStructuredWebsiteBrief({
        tenantId: state.tenantId,
        projectId: state.projectId,
        signals,
        answers: [],
        connectorContext: state.connectorContext,
      });
      const summary = formatPreGenerationSummary(brief);

      return {
        ...newState,
        step: "SUMMARY",
        brief,
        summary,
        completionPercentage: 75,
        canResume: true,
      };
    }

    return {
      ...newState,
      step: "QUESTIONS",
      completionPercentage: 25,
      canResume: true,
    };
  }

  /**
   * Records an answer for the current question and advances or transitions to SUMMARY.
   */
  public answerQuestion(
    state: CreatorSessionState,
    answer: { questionId: string; selectedOptionId?: string; customText?: string }
  ): CreatorSessionState {
    const updatedAnswers = state.answers.filter((a) => a.questionId !== answer.questionId);
    updatedAnswers.push(answer);

    const nextIndex = state.currentQuestionIndex + 1;
    const totalQuestions = state.questions.length;

    if (nextIndex < totalQuestions) {
      const completionPercentage = Math.round(25 + (nextIndex / totalQuestions) * 50);
      return {
        ...state,
        answers: updatedAnswers,
        currentQuestionIndex: nextIndex,
        completionPercentage,
        lastSavedAt: new Date().toISOString(),
      };
    }

    // All questions answered: compile brief & summary
    const signals = normalizeCustomerInput(state.initialMessage);
    const brief = buildStructuredWebsiteBrief({
      tenantId: state.tenantId,
      projectId: state.projectId,
      signals,
      answers: updatedAnswers,
      connectorContext: state.connectorContext,
    });
    const summary = formatPreGenerationSummary(brief);

    return {
      ...state,
      step: "SUMMARY",
      answers: updatedAnswers,
      brief,
      summary,
      completionPercentage: 80,
      lastSavedAt: new Date().toISOString(),
    };
  }

  /**
   * Executes website generation through WebsiteGenerationEngine.
   */
  public async generateWebsite(state: CreatorSessionState): Promise<CreatorSessionState> {
    if (!state.brief) {
      return {
        ...state,
        step: "ERROR",
        error: "We need one more detail before we can build your website.",
      };
    }

    const masterPrompt = compileMasterWebsitePrompt(state.brief);

    try {
      const generated = await websiteGenerationEngine.generate({
        tenantId: state.tenantId,
        projectId: state.projectId,
        prompt: masterPrompt,
        // Found live during E2E testing: this brief already resolves websiteType
        // (from the customer's confirmed answers, shown to them on the summary
        // screen) but it was never forwarded here, so the engine silently
        // re-derived its own -- and re-derived it wrong every time. Forward the
        // brief's own resolution instead of letting the engine guess again.
        websiteType: state.brief.websiteType.value,
        brandContext: {
          businessName: state.brief.businessName.value,
          businessCategory: state.brief.businessCategory.value,
          targetAudience: state.brief.targetAudience.value,
          brandAesthetic: state.brief.visualStyle.value === "PREMIUM_LUXURY" ? "luxury" : "modern",
        },
      });

      if (!generated.version) {
        generated.version = 1;
      }

      const completedStages = state.stages.map((s) => ({
        ...s,
        isComplete: true,
        isActive: false,
      }));

      return {
        ...state,
        step: "READY",
        generatedSite: generated,
        stages: completedStages,
        completionPercentage: 100,
        canResume: false,
        lastSavedAt: new Date().toISOString(),
      };
    } catch {
      return {
        ...state,
        step: "ERROR",
        error: "We couldn't finish generating your website right now. Please try again.",
      };
    }
  }

  /**
   * Returns standard selectable regeneration options.
   */
  public getRegenerationOptions(): RegenerateOptionItem[] {
    return [
      {
        id: "opt_more_premium",
        label: "Make it more premium & luxury",
        description: "Enrich dark typography with champagne gold accents and editorial layouts.",
        styleValue: "PREMIUM_LUXURY",
        action: "change_style",
      },
      {
        id: "opt_more_minimal",
        label: "Make it more minimal & clean",
        description: "Emphasize whitespace, modern sans-serif typography, and sleek lines.",
        styleValue: "EDITORIAL_MINIMAL",
        action: "change_style",
      },
      {
        id: "opt_change_colors",
        label: "Change color palette",
        description: "Choose a new primary or accent color scheme.",
        action: "change_style",
      },
      {
        id: "opt_add_pages",
        label: "Add extra pages (e.g. Journal, FAQ)",
        description: "Expand your site navigation with editorial or help sections.",
        action: "add_pages",
      },
      {
        id: "opt_start_over",
        label: "Start over from scratch",
        description: "Reset questions and brief to begin a new website design.",
        action: "start_over",
      },
    ];
  }

  /**
   * Executes a safe versioned regeneration without destroying previous versions.
   */
  public async executeRegeneration(
    state: CreatorSessionState,
    option: {
      action: string;
      customInstruction?: string;
      newStyle?: BriefVisualStyle;
      addPages?: string[];
    }
  ): Promise<CreatorSessionState> {
    if (!state.brief || !state.generatedSite) {
      return {
        ...state,
        step: "ERROR",
        error: "Cannot regenerate without an active website version.",
      };
    }

    const updatedBrief: StructuredWebsiteBrief = {
      ...state.brief,
      visualStyle: option.newStyle
        ? { value: option.newStyle, source: "customer_confirmed" }
        : state.brief.visualStyle,
      requiredPages: option.addPages
        ? Array.from(new Set([...state.brief.requiredPages, ...option.addPages]))
        : state.brief.requiredPages,
      updatedAt: new Date().toISOString(),
    };

    const masterPrompt = compileMasterWebsitePrompt(updatedBrief);
    const instructionText = option.customInstruction || `Regenerate with style: ${option.newStyle || "updated"}`;

    const newVersionNum = (state.generatedSite.version || 1) + 1;

    try {
      const generated = await websiteGenerationEngine.generate({
        tenantId: state.tenantId,
        projectId: state.projectId,
        prompt: `${masterPrompt}\n\n[REGENERATION INSTRUCTION]\n${instructionText}`,
        previousVersion: state.generatedSite.specification,
        brandContext: {
          businessName: updatedBrief.businessName.value,
          businessCategory: updatedBrief.businessCategory.value,
          brandAesthetic: updatedBrief.visualStyle.value === "PREMIUM_LUXURY" ? "luxury" : "modern",
        },
      });

      generated.version = newVersionNum;

      return {
        ...state,
        step: "READY",
        brief: updatedBrief,
        summary: formatPreGenerationSummary(updatedBrief),
        generatedSite: generated,
        lastSavedAt: new Date().toISOString(),
      };
    } catch {
      return {
        ...state,
        step: "ERROR",
        error: "We couldn't generate the new version right now. Your current version is safe.",
      };
    }
  }
}

export const smartWebsiteCreatorController = new SmartWebsiteCreatorController();
