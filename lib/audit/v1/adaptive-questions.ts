import { isUnknown, type ProvenanceField } from "./provenance.ts";
import type { CandidateGoal } from "./smart-discovery.ts";

export interface AdaptiveQuestion {
  id: string;
  prompt: string;
  helper?: string;
  optional: boolean;
  type?: "text" | "textarea" | "goal_select" | "single_select";
  options?: Array<{ id: string; label: string; rationale?: string }>;
  neededWhen: (profile: DiscoveredBusinessProfile) => boolean;
}

export interface DiscoveredBusinessProfile {
  name?: ProvenanceField<string>;
  category?: ProvenanceField<string>;
  location?: ProvenanceField<string>;
  services?: ProvenanceField<string[]>;
  audience?: ProvenanceField<string>;
  offer?: ProvenanceField<string>;
  phone?: ProvenanceField<string>;
  email?: ProvenanceField<string>;
  positioning?: ProvenanceField<string>;
  differentiators?: ProvenanceField<string[]>;
  reviews?: ProvenanceField<{ rating: number; count: number | null }>;
  websiteUrl?: string;
  candidateGoals?: CandidateGoal[];
  businessStage?: string;
}

export const ADAPTIVE_QUESTION_BANK: AdaptiveQuestion[] = [
  {
    id: "primaryGoal",
    prompt: "Which growth priority matters most in the next 90 days?",
    helper: "Select from goals suggested by your business evidence or write your own.",
    optional: false,
    type: "goal_select",
    neededWhen: () => true,
  },
  {
    id: "biggestGrowthProblem",
    prompt: "What is your biggest growth obstacle right now?",
    helper: "Tell us where sales or leads are getting stuck.",
    optional: false,
    type: "textarea",
    neededWhen: () => true,
  },
  {
    id: "idealCustomer",
    prompt: "Who is your primary customer?",
    helper: "e.g. Homeowners, Local businesses, Parents, etc.",
    optional: false,
    type: "text",
    neededWhen: (profile) => isUnknown(profile.audience?.value),
  },
  {
    id: "priorityOffering",
    prompt: "Which specific service or product do you want to grow most?",
    helper: "Focuses the audit recommendations on your highest-margin offer.",
    optional: false,
    type: "text",
    neededWhen: (profile) => isUnknown(profile.services?.value) || (profile.services?.value.length ?? 0) > 3,
  },
  {
    id: "leadStuck",
    prompt: "Where do customer inquiries usually drop off?",
    helper: "e.g. Price objections, slow follow-up, lack of trust, comparing competitors.",
    optional: true,
    type: "textarea",
    neededWhen: () => true,
  },
  {
    id: "monthlyBudget",
    prompt: "Approximate monthly marketing budget? (optional)",
    helper: "Helps tailor organic vs paid growth tactics.",
    optional: true,
    type: "text",
    neededWhen: () => true,
  },
];

export function selectAdaptiveQuestions(profile: DiscoveredBusinessProfile): AdaptiveQuestion[] {
  const selected = ADAPTIVE_QUESTION_BANK.filter((question) => question.neededWhen(profile));
  const required = selected.filter((question) => !question.optional);
  const optional = selected.filter((question) => question.optional);
  const min = 2;
  const max = 5;
  const wellDiscovered = !isUnknown(profile.name?.value)
    && !isUnknown(profile.services?.value)
    && !isUnknown(profile.audience?.value)
    && Boolean(profile.websiteUrl);
  const target = wellDiscovered ? Math.min(3, max) : max;
  const picked = [...required];
  for (const question of optional) {
    if (picked.length >= target) break;
    picked.push(question);
  }
  while (picked.length < min && ADAPTIVE_QUESTION_BANK[picked.length]) {
    const fallback = ADAPTIVE_QUESTION_BANK[picked.length]!;
    if (!picked.some((item) => item.id === fallback.id)) picked.push(fallback);
    else break;
  }
  return picked.slice(0, max);
}

export function adaptiveAnswersComplete(
  questions: AdaptiveQuestion[],
  answers: Record<string, unknown>,
): boolean {
  return questions
    .filter((question) => !question.optional)
    .every((question) => {
      let value = answers[question.id];
      if (question.id === "primaryGoal" && (value === undefined || value === "")) {
        value = answers.ninetyDayResult;
      }
      if (value === "not_sure" || value === "skipped") return true;
      if (Array.isArray(value) && value.length > 0) return true;
      return typeof value === "string" && value.trim().length > 0;
    });
}

