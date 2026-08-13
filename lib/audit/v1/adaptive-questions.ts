import { isUnknown, type ProvenanceField } from "./provenance.ts";

export interface AdaptiveQuestion {
  id: string;
  prompt: string;
  optional: boolean;
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
}

export const ADAPTIVE_QUESTION_BANK: AdaptiveQuestion[] = [
  {
    id: "biggestGrowthProblem",
    prompt: "What is your biggest growth problem right now?",
    optional: false,
    neededWhen: () => true,
  },
  {
    id: "ninetyDayResult",
    prompt: "What result matters most in the next 90 days?",
    optional: false,
    neededWhen: () => true,
  },
  {
    id: "priorityOffering",
    prompt: "Which product or service is most important to grow?",
    optional: false,
    neededWhen: (profile) => isUnknown(profile.services?.value) || (profile.services?.value.length ?? 0) > 3,
  },
  {
    id: "idealCustomer",
    prompt: "Who is your ideal customer?",
    optional: false,
    neededWhen: (profile) => isUnknown(profile.audience?.value),
  },
  {
    id: "leadStuck",
    prompt: "Where do leads usually get stuck?",
    optional: false,
    neededWhen: () => true,
  },
  {
    id: "monthlyBudget",
    prompt: "Approximate monthly marketing budget? (optional)",
    optional: true,
    neededWhen: () => true,
  },
  {
    id: "capacity",
    prompt: "Current lead or customer capacity? (optional)",
    optional: true,
    neededWhen: () => true,
  },
];

export function selectAdaptiveQuestions(profile: DiscoveredBusinessProfile): AdaptiveQuestion[] {
  const selected = ADAPTIVE_QUESTION_BANK.filter((question) => question.neededWhen(profile));
  const required = selected.filter((question) => !question.optional);
  const optional = selected.filter((question) => question.optional);
  const min = 3;
  const max = 7;
  const wellDiscovered = !isUnknown(profile.name?.value)
    && !isUnknown(profile.services?.value)
    && !isUnknown(profile.audience?.value)
    && Boolean(profile.websiteUrl);
  const target = wellDiscovered ? Math.min(5, max) : max;
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
      const value = answers[question.id];
      if (value === "not_sure" || value === "skipped") return true;
      return typeof value === "string" && value.trim().length > 0;
    });
}
