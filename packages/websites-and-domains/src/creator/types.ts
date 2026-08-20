/**
 * Customer-Facing Smart Website Creator Types & State Contracts
 */

import type {
  StructuredWebsiteBrief,
  SmartQuestion,
  CustomerAnswer,
  PreGenerationSummary,
  AuthorizedConnectorContext,
  BriefVisualStyle,
} from "../brief/types.ts";
import type { GenerateWebsiteOutput } from "../generation/types.ts";

export type CreatorFlowStep =
  | "INPUT"
  | "QUESTIONS"
  | "SUMMARY"
  | "GENERATING"
  | "READY"
  | "ERROR";

export interface GenerationStage {
  id: string;
  label: string;
  subtext?: string;
  isComplete: boolean;
  isActive: boolean;
}

export const DEFAULT_GENERATION_STAGES: Array<{ id: string; label: string }> = [
  { id: "stage_understand", label: "Understanding your business" },
  { id: "stage_plan", label: "Planning your website" },
  { id: "stage_design", label: "Creating your design" },
  { id: "stage_content", label: "Writing your content" },
  { id: "stage_images", label: "Preparing images" },
  { id: "stage_pages", label: "Building your pages" },
  { id: "stage_mobile", label: "Checking mobile experience" },
  { id: "stage_qa", label: "Running quality checks" },
];

export interface CreatorSessionState {
  sessionId: string;
  tenantId: string;
  projectId?: string;
  step: CreatorFlowStep;
  currentQuestionIndex: number;
  initialMessage: string;
  detectedLanguage: "en" | "hi" | "hinglish";
  selectedLanguage: "english" | "hindi" | "bilingual";
  answers: CustomerAnswer[];
  questions: SmartQuestion[];
  connectorContext?: AuthorizedConnectorContext;
  knownFields: Array<{ label: string; value: string; source: string }>;
  connectorChips: string[];
  brief?: StructuredWebsiteBrief;
  summary?: PreGenerationSummary;
  generatedSite?: GenerateWebsiteOutput;
  currentStageIndex: number;
  stages: GenerationStage[];
  error?: string;
  canResume: boolean;
  completionPercentage: number;
  lastSavedAt: string;
}

export interface RegenerateOptionItem {
  id: string;
  label: string;
  description: string;
  styleValue?: BriefVisualStyle;
  action: "change_style" | "add_pages" | "change_goal" | "change_cta" | "start_over" | "custom";
}
