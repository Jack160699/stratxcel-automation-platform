import { GROWTH_LIFECYCLE } from "./lifecycle.ts";

export const LOCAL_BUSINESS_JOURNEY_STAGES = [
  {
    id: "get-found",
    title: "Get found",
    subtitle: "Search + website clarity",
    lifecycleId: "discovered",
    description: "Help nearby customers find you when they search.",
  },
  {
    id: "get-attention",
    title: "Get attention",
    subtitle: "Social + content",
    lifecycleId: "attention",
    description: "Show up consistently where your customers already spend time.",
  },
  {
    id: "get-enquiries",
    title: "Get enquiries",
    subtitle: "Capture + campaigns",
    lifecycleId: "convert",
    description: "Turn interest into calls, forms, and WhatsApp messages.",
  },
  {
    id: "follow-up",
    title: "Follow up",
    subtitle: "CRM + conversations",
    lifecycleId: "manage",
    description: "Reply faster and know who owns the next step.",
  },
  {
    id: "understand",
    title: "Understand",
    subtitle: "Analytics + reports",
    lifecycleId: "performance",
    description: "See what is working before you invest more.",
  },
] as const;

export type LocalBusinessJourneyStageId = (typeof LOCAL_BUSINESS_JOURNEY_STAGES)[number]["id"];
export type GrowthLifecycleId = (typeof GROWTH_LIFECYCLE)[number]["id"];

const lifecycleIds = new Set(GROWTH_LIFECYCLE.map((stage) => stage.id));
for (const stage of LOCAL_BUSINESS_JOURNEY_STAGES) {
  if (!lifecycleIds.has(stage.lifecycleId)) {
    throw new Error(`Unknown lifecycleId for journey stage: ${stage.id}`);
  }
}

export function getJourneyStageById(id: string) {
  return LOCAL_BUSINESS_JOURNEY_STAGES.find((stage) => stage.id === id);
}
