/**
 * Hermes Action UI Contract
 * Channel-agnostic interactive UI system for WhatsApp, Telegram, Web, and Admin.
 *
 * PROGRESS STATES:
 * - "🧠 Analyzing..." (multimodal vision, documents, links)
 * - "✨ Creating..." (image generation, creative assets)
 * - "🌐 Researching..." (deep search, market discovery)
 * - "🛠️ Building..." (website creation, coding tasks)
 * - "🤖 Deploying..." (agent deployment, live hosting)
 *
 * RESULT ACTIONS:
 * - 2-4 concise, high-value next actions
 * - Native WhatsApp reply buttons (max 3, max 20 chars per title)
 * - Fallback to concise numbered text list (1. ..., 2. ...) for non-interactive clients
 */

export type HermesProgressStage =
  | "analyzing"
  | "creating"
  | "researching"
  | "building"
  | "deploying";

export const HERMES_PROGRESS_LABELS: Record<HermesProgressStage, string> = {
  analyzing: "🧠 Analyzing...",
  creating: "✨ Creating...",
  researching: "🌐 Researching...",
  building: "🛠️ Building...",
  deploying: "🤖 Deploying...",
};

export interface HermesActionItem {
  id: string;
  title: string; // Max 20 chars for WhatsApp button compatibility
  url?: string;
  payload?: Record<string, unknown>;
}

export interface HermesActionUIResponse {
  headline?: string;
  summary: string; // 1-3 concise sentences, no giant essays
  progressStage?: HermesProgressStage;
  actions: HermesActionItem[];
}

export interface FormattedChannelActionReply {
  text: string;
  interactiveButtons?: Array<{ id: string; title: string }>;
}

/**
 * Formats a Hermes Action UI response specifically for WhatsApp Cloud API.
 * Uses native reply buttons (max 3, max 20 chars) and appends a clean
 * numbered fallback list for clients or configurations where buttons are unavailable.
 */
export function formatActionUIForWhatsApp(response: HermesActionUIResponse): FormattedChannelActionReply {
  let bodyText = "";
  if (response.progressStage) {
    bodyText += `${HERMES_PROGRESS_LABELS[response.progressStage]}\n\n`;
  }
  if (response.headline) {
    bodyText += `*${response.headline}*\n\n`;
  }
  bodyText += response.summary;

  const validActions = (response.actions || []).slice(0, 4);
  const interactiveButtons = validActions.slice(0, 3).map((a) => ({
    id: a.id.slice(0, 256),
    title: a.title.slice(0, 20),
  }));

  if (validActions.length > 0) {
    bodyText += `\n\n${validActions.map((a, i) => `${i + 1}. ${a.title}`).join("\n")}`;
  }

  return {
    text: bodyText,
    interactiveButtons: interactiveButtons.length > 0 ? interactiveButtons : undefined,
  };
}

/**
 * Formats a Hermes Action UI response for Web / Admin Copilot JSON rendering.
 */
export function formatActionUIForWeb(response: HermesActionUIResponse): Record<string, unknown> {
  return {
    progressStage: response.progressStage,
    progressLabel: response.progressStage ? HERMES_PROGRESS_LABELS[response.progressStage] : undefined,
    headline: response.headline,
    summary: response.summary,
    actions: response.actions,
    timestamp: new Date().toISOString(),
  };
}
