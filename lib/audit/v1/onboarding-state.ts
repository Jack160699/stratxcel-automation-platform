import { sanitizeChannels, type AuditBusinessChannel } from "./channels.ts";
import { selectAdaptiveQuestions, adaptiveAnswersComplete, type DiscoveredBusinessProfile } from "./adaptive-questions.ts";

export const CONNECT_DISCOVER_VERSION = "connect_discover_v1";

export type AuditOnboardingStep =
  | "connect"
  | "discovering"
  | "verify"
  | "questions"
  | "brain"
  | "generating"
  | "complete";

export interface AuditWhatsAppOnboardingDraft {
  countryIso: string;
  nationalNumber: string;
  consent: boolean;
}

export interface AuditOnboardingState {
  flowVersion: typeof CONNECT_DISCOVER_VERSION;
  step: AuditOnboardingStep;
  websiteUrl: string;
  channels: AuditBusinessChannel[];
  profile?: DiscoveredBusinessProfile;
  verified?: boolean;
  adaptiveAnswers: Record<string, string>;
  whatsappDelivery?: AuditWhatsAppOnboardingDraft;
  updatedAt: string;
}

export function emptyOnboardingState(): AuditOnboardingState {
  return {
    flowVersion: CONNECT_DISCOVER_VERSION,
    step: "connect",
    websiteUrl: "",
    channels: [],
    adaptiveAnswers: {},
    updatedAt: new Date().toISOString(),
  };
}

export function parseOnboardingState(deepDive: unknown): AuditOnboardingState | null {
  const root = deepDive && typeof deepDive === "object" && !Array.isArray(deepDive)
    ? deepDive as Record<string, unknown>
    : {};
  const raw = root.v1Experience;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.flowVersion !== CONNECT_DISCOVER_VERSION) return null;
  const step = typeof row.step === "string" ? row.step as AuditOnboardingStep : "connect";
  return {
    flowVersion: CONNECT_DISCOVER_VERSION,
    step,
    websiteUrl: typeof row.websiteUrl === "string" ? row.websiteUrl : "",
    channels: sanitizeChannels(row.channels),
    profile: row.profile && typeof row.profile === "object" ? row.profile as DiscoveredBusinessProfile : undefined,
    verified: row.verified === true,
    adaptiveAnswers: recordStrings(row.adaptiveAnswers),
    whatsappDelivery: parseWhatsAppDraft(row.whatsappDelivery),
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date().toISOString(),
  };
}

export function isV1OnboardingComplete(state: AuditOnboardingState | null): boolean {
  if (!state?.verified || !state.websiteUrl) return false;
  const questions = selectAdaptiveQuestions(state.profile ?? {});
  return adaptiveAnswersComplete(questions, state.adaptiveAnswers);
}

export function resumeStep(state: AuditOnboardingState | null): AuditOnboardingStep {
  if (!state) return "connect";
  if (!state.websiteUrl) return "connect";
  if (!state.profile) return "discovering";
  if (!state.verified) return "verify";
  if (!isV1OnboardingComplete(state)) return "questions";
  if (state.step === "generating" || state.step === "complete") return state.step;
  return "brain";
}

function parseWhatsAppDraft(value: unknown): AuditWhatsAppOnboardingDraft | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const countryIso = typeof row.countryIso === "string" ? row.countryIso.trim().toUpperCase().slice(0, 2) : "";
  const nationalNumber = typeof row.nationalNumber === "string" ? row.nationalNumber.replace(/[^0-9]/g, "").slice(0, 15) : "";
  if (!countryIso || !nationalNumber) return undefined;
  return { countryIso, nationalNumber, consent: row.consent === true };
}

function recordStrings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, item]) => [key.slice(0, 80), item.trim().slice(0, 2_000)]),
  );
}
