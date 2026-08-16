"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeading } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/Feedback";
import { trackFunnel } from "@/lib/analytics/events";

export interface IntakeOrder {
  business_name: string | null;
  industry: string | null;
  website_url: string | null;
  social_links?: string[] | null;
  deep_dive_answers: Record<string, unknown> | null;
  goals_answers: Record<string, unknown> | null;
}

type Phase = "business" | "deep_dive" | "goals";
type AnswerValue = string | string[];
type AnswerMap = Record<string, AnswerValue>;
type QuestionKind = "text" | "textarea" | "single" | "multi";

type Option = { value: string; label: string };

type IntakeStep = {
  id: string;
  phase: Phase;
  title: string;
  helper?: string;
  kind: QuestionKind;
  placeholder?: string;
  options?: Option[];
  required?: boolean;
  maxSelections?: number;
  showWhen?: (answers: AnswerMap) => boolean;
};

const PLACEHOLDER = "Pending — completed in intake";

const CUSTOMER_OPTIONS: Option[] = [
  ["women", "Women"], ["men", "Men"], ["families", "Families"], ["students", "Students"],
  ["working_professionals", "Working professionals"], ["business_owners", "Business owners"],
  ["parents", "Parents"], ["premium_customers", "Premium customers"], ["other", "Other"],
].map(([value, label]) => ({ value, label }));

const CHANNEL_OPTIONS: Option[] = [
  ["walk_ins", "Walk-ins"], ["google", "Google"], ["instagram", "Instagram"], ["facebook", "Facebook"],
  ["whatsapp", "WhatsApp"], ["referrals", "Referrals"], ["ads", "Paid ads"], ["website", "Website"],
  ["marketplaces", "Marketplace / directory"], ["other", "Other"],
].map(([value, label]) => ({ value, label }));

const STEPS: IntakeStep[] = [
  {
    id: "businessName",
    phase: "business",
    title: "What is your business called?",
    helper: "Use the name customers know you by.",
    kind: "text",
    placeholder: "e.g. Gupta Garments",
    required: true,
  },
  {
    id: "onlinePresence",
    phase: "business",
    title: "Can we find your business online?",
    helper: "Optional. Paste any website, Google, Instagram or Facebook link you already have. One link per line is easiest.",
    kind: "textarea",
    placeholder: "https://instagram.com/yourbusiness",
  },
  {
    id: "businessDescription",
    phase: "business",
    title: "What do you sell or what service do you provide?",
    helper: "Say it in your own words. No marketing language needed.",
    kind: "textarea",
    placeholder: "We sell sarees, kurtis and bridal wear from our shop in Bhilai.",
    required: true,
  },
  {
    id: "businessReach",
    phase: "deep_dive",
    title: "Where do you do business?",
    helper: "Choose the option that is closest to how you sell today.",
    kind: "single",
    required: true,
    options: [
      { value: "local_area", label: "My local area" },
      { value: "city", label: "My city" },
      { value: "multiple_cities", label: "Multiple cities" },
      { value: "all_india", label: "All India" },
      { value: "online_anywhere", label: "Online / anywhere" },
    ],
  },
  {
    id: "location",
    phase: "deep_dive",
    title: "Which city or area do you mainly serve?",
    helper: "Just the main location is enough.",
    kind: "text",
    placeholder: "e.g. Bhilai, Chhattisgarh",
    required: true,
    showWhen: (answers) => answers.businessReach !== "online_anywhere",
  },
  {
    id: "majorProducts",
    phase: "deep_dive",
    title: "What are the main things customers buy from you?",
    helper: "Add 3–5 products or services. You can write them on separate lines.",
    kind: "textarea",
    placeholder: "Sarees\nKurtis\nBridal wear\nAlteration",
    required: true,
  },
  {
    id: "priorityOffering",
    phase: "deep_dive",
    title: "What would you most like to sell more of?",
    helper: "This helps us focus your Audit on the part of the business that matters most.",
    kind: "text",
    placeholder: "e.g. Bridal wear",
    required: true,
  },
  {
    id: "customerSegments",
    phase: "deep_dive",
    title: "Who usually buys from you?",
    helper: "Choose as many as fit. You do not need to know your ‘target audience’.",
    kind: "multi",
    options: CUSTOMER_OPTIONS,
    required: true,
  },
  {
    id: "customerAgeGroups",
    phase: "deep_dive",
    title: "What age group buys from you most?",
    helper: "Optional — choose more than one if needed.",
    kind: "multi",
    options: [
      { value: "under_18", label: "Under 18" },
      { value: "18_24", label: "18–24" },
      { value: "25_34", label: "25–34" },
      { value: "35_44", label: "35–44" },
      { value: "45_60", label: "45–60" },
      { value: "60_plus", label: "60+" },
      { value: "mixed", label: "Mixed / all ages" },
    ],
  },
  {
    id: "reasonsChosen",
    phase: "deep_dive",
    title: "What do customers like most about your business?",
    helper: "Choose what you hear from customers most often.",
    kind: "multi",
    required: true,
    options: [
      { value: "good_price", label: "Good price" },
      { value: "better_quality", label: "Better quality" },
      { value: "trusted_locally", label: "Trusted locally" },
      { value: "fast_service", label: "Fast service" },
      { value: "unique_products", label: "Unique products" },
      { value: "customer_service", label: "Good customer service" },
      { value: "convenient_location", label: "Convenient location" },
      { value: "custom_work", label: "Custom / personalised work" },
      { value: "not_sure", label: "I’m not sure yet" },
    ],
  },
  {
    id: "averageSpend",
    phase: "deep_dive",
    title: "Around how much does one customer normally spend?",
    helper: "A rough range is enough. You can choose ‘Prefer not to say’.",
    kind: "single",
    options: [
      { value: "under_500", label: "Under ₹500" },
      { value: "500_1000", label: "₹500–₹1,000" },
      { value: "1000_5000", label: "₹1,000–₹5,000" },
      { value: "5000_20000", label: "₹5,000–₹20,000" },
      { value: "20000_plus", label: "₹20,000+" },
      { value: "varies", label: "It varies a lot" },
      { value: "prefer_not", label: "Prefer not to say" },
    ],
  },
  {
    id: "discoveryChannels",
    phase: "deep_dive",
    title: "How do customers usually find you?",
    helper: "Choose every place that brings you customers today.",
    kind: "multi",
    options: CHANNEL_OPTIONS,
    required: true,
  },
  {
    id: "purchaseChannels",
    phase: "deep_dive",
    title: "How do customers contact you or buy from you?",
    helper: "Choose all that apply.",
    kind: "multi",
    required: true,
    options: [
      { value: "shop_office", label: "Visit my shop / office" },
      { value: "phone_call", label: "Phone call" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "social_dm", label: "Instagram / Facebook message" },
      { value: "website", label: "Website" },
      { value: "marketplace", label: "Marketplace" },
      { value: "salesperson", label: "Salesperson" },
      { value: "other", label: "Other" },
    ],
  },
  {
    id: "biggestProblem",
    phase: "deep_dive",
    title: "What is the biggest problem in your business right now?",
    helper: "Choose the one that hurts the most today.",
    kind: "single",
    required: true,
    options: [
      { value: "not_enough_customers", label: "Not enough customers" },
      { value: "enquiries_not_buying", label: "People ask but don’t buy" },
      { value: "inconsistent_sales", label: "Sales are inconsistent" },
      { value: "low_online_visibility", label: "Low online visibility" },
      { value: "weak_social", label: "Social media is weak" },
      { value: "no_time_marketing", label: "No time for marketing" },
      { value: "low_repeat", label: "Customers don’t come back" },
      { value: "competition", label: "Too much competition" },
      { value: "website_not_helping", label: "Website isn’t helping" },
      { value: "not_sure", label: "I don’t know what to focus on" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    id: "primaryGoal",
    phase: "goals",
    title: "What do you want to improve first?",
    helper: "Pick the outcome you care about most right now.",
    kind: "single",
    required: true,
    options: [
      { value: "more_customers", label: "Get more customers" },
      { value: "more_enquiries", label: "Get more calls / WhatsApp enquiries" },
      { value: "more_store_visits", label: "Increase shop visits" },
      { value: "more_online_sales", label: "Increase online sales" },
      { value: "stronger_brand", label: "Build a stronger brand" },
      { value: "google_presence", label: "Improve Google presence" },
      { value: "social_media", label: "Improve social media" },
      { value: "repeat_customers", label: "Get more repeat customers" },
      { value: "launch_offer", label: "Launch a new product / service" },
      { value: "new_city", label: "Grow into another city" },
      { value: "other", label: "Something else" },
    ],
  },
  {
    id: "successDefinition",
    phase: "goals",
    title: "What would make the next 3 months successful for you?",
    helper: "Use your own words. Example: more regular customers, 50 more enquiries, or ₹2 lakh more monthly sales.",
    kind: "textarea",
    placeholder: "In 3 months I want…",
    required: true,
  },
  {
    id: "competitors",
    phase: "deep_dive",
    title: "Is there any business you compete with or want to become like?",
    helper: "Optional. Add a business name, Instagram, website or Google listing. Skip if you don’t know.",
    kind: "textarea",
    placeholder: "Competitor name or link",
  },
  {
    id: "currentMarketing",
    phase: "deep_dive",
    title: "What marketing are you already doing?",
    helper: "Optional. Choose everything you use today.",
    kind: "multi",
    options: [
      { value: "nothing", label: "Nothing currently" },
      { value: "social_posting", label: "Instagram / Facebook posting" },
      { value: "meta_ads", label: "Meta ads" },
      { value: "google_ads", label: "Google ads" },
      { value: "whatsapp_marketing", label: "WhatsApp marketing" },
      { value: "influencers", label: "Influencers" },
      { value: "offline", label: "Flyers / offline ads" },
      { value: "seo", label: "SEO" },
      { value: "marketplace", label: "Marketplace listings" },
      { value: "agency", label: "Agency / freelancer" },
      { value: "other", label: "Other" },
    ],
  },
  {
    id: "bestCustomerSource",
    phase: "deep_dive",
    title: "Where do your best customers usually come from?",
    helper: "Optional. Pick the closest answer.",
    kind: "single",
    options: CHANNEL_OPTIONS,
  },
  {
    id: "triedAlready",
    phase: "goals",
    title: "Have you tried anything that did not work?",
    helper: "Optional. This helps us avoid recommending the same thing again.",
    kind: "textarea",
    placeholder: "We tried Facebook ads for one month but…",
  },
  {
    id: "brandPersonality",
    phase: "deep_dive",
    title: "How should customers feel about your business?",
    helper: "Optional. Choose up to 3.",
    kind: "multi",
    maxSelections: 3,
    options: [
      { value: "affordable", label: "Affordable" },
      { value: "premium", label: "Premium" },
      { value: "friendly", label: "Friendly" },
      { value: "professional", label: "Professional" },
      { value: "modern", label: "Modern" },
      { value: "traditional", label: "Traditional" },
      { value: "trustworthy", label: "Trustworthy" },
      { value: "youthful", label: "Fun / youthful" },
      { value: "luxury", label: "Luxury" },
      { value: "practical", label: "Simple / practical" },
    ],
  },
  {
    id: "additionalNotes",
    phase: "goals",
    title: "Anything else we should know?",
    helper: "Optional. Tell us anything important we did not ask.",
    kind: "textarea",
    placeholder: "One more thing about our business is…",
  },
];

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(/,|\n|;/g).map((item) => item.trim()).filter(Boolean);
  return [];
}

function hasAnswer(value: AnswerValue | undefined): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) && value.length > 0;
}

function parseLinks(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s,]+/gi) ?? [];
  return [...new Set(matches.map((link) => link.replace(/[).,]+$/, "")))].slice(0, 12);
}

function likelyWebsite(links: string[]): string | undefined {
  const socialHosts = ["instagram.com", "facebook.com", "fb.com", "google.com", "maps.app.goo.gl", "youtube.com", "linkedin.com"];
  return links.find((link) => {
    try {
      const host = new URL(link).hostname.replace(/^www\./, "");
      return !socialHosts.some((social) => host === social || host.endsWith(`.${social}`));
    } catch {
      return false;
    }
  });
}

function initialAnswers(order: IntakeOrder): AnswerMap {
  const deep = objectValue(order.deep_dive_answers);
  const goals = objectValue(order.goals_answers);
  const online = stringValue(deep.onlinePresence) || [order.website_url, ...(order.social_links ?? [])].filter(Boolean).join("\n");
  return {
    businessName: order.business_name === PLACEHOLDER ? "" : order.business_name ?? "",
    onlinePresence: online,
    businessDescription: stringValue(deep.businessDescription),
    businessReach: stringValue(deep.businessReach) || stringValue(deep.geographicReach),
    location: stringValue(deep.location),
    majorProducts: stringValue(deep.majorProducts),
    priorityOffering: stringValue(deep.priorityOffering),
    customerSegments: arrayValue(deep.customerSegments).length > 0 ? arrayValue(deep.customerSegments) : arrayValue(deep.idealCustomers),
    customerAgeGroups: arrayValue(deep.customerAgeGroups),
    reasonsChosen: arrayValue(deep.reasonsChosen).length > 0 ? arrayValue(deep.reasonsChosen) : arrayValue(deep.differentiation),
    averageSpend: stringValue(deep.averageSpend) || stringValue(deep.pricingRange),
    discoveryChannels: arrayValue(deep.discoveryChannels).length > 0 ? arrayValue(deep.discoveryChannels) : arrayValue(deep.leadSources),
    purchaseChannels: arrayValue(deep.purchaseChannels),
    biggestProblem: stringValue(deep.biggestProblem) || stringValue(deep.currentProblems),
    primaryGoal: stringValue(goals.primaryGoal) || stringValue(goals.topPriorities),
    successDefinition: stringValue(goals.successDefinition),
    competitors: stringValue(deep.competitors),
    currentMarketing: arrayValue(deep.currentMarketing),
    bestCustomerSource: stringValue(deep.bestCustomerSource),
    triedAlready: stringValue(goals.triedAlready),
    brandPersonality: arrayValue(deep.brandPersonality),
    additionalNotes: stringValue(goals.additionalNotes),
  };
}

function saveData(step: IntakeStep, answers: AnswerMap): Record<string, unknown> {
  const value = answers[step.id];
  switch (step.id) {
    case "businessName":
      return { businessName: stringValue(value) };
    case "onlinePresence": {
      const raw = stringValue(value);
      const links = parseLinks(raw);
      return { onlinePresence: raw, socialLinks: links, ...(likelyWebsite(links) ? { websiteUrl: likelyWebsite(links) } : {}) };
    }
    case "businessDescription":
      return { businessDescription: stringValue(value) };
    case "businessReach": {
      const reach = stringValue(value);
      return { businessReach: reach, geographicReach: reach, ...(reach === "online_anywhere" ? { location: "" } : {}) };
    }
    case "majorProducts":
      return { majorProducts: stringValue(value) };
    case "priorityOffering":
      return { priorityOffering: stringValue(value) };
    case "customerSegments":
      return { customerSegments: arrayValue(value), idealCustomers: arrayValue(value).join(", ") };
    case "reasonsChosen":
      return { reasonsChosen: arrayValue(value), differentiation: arrayValue(value).join(", ") };
    case "averageSpend":
      return { averageSpend: stringValue(value), pricingRange: stringValue(value) };
    case "discoveryChannels":
      return { discoveryChannels: arrayValue(value), leadSources: arrayValue(value).join(", ") };
    case "purchaseChannels":
      return { purchaseChannels: arrayValue(value), salesProcess: arrayValue(value).join(", ") };
    case "biggestProblem":
      return { biggestProblem: stringValue(value), currentProblems: stringValue(value) };
    case "primaryGoal":
      return { primaryGoal: stringValue(value), topPriorities: stringValue(value) };
    default:
      return { [step.id]: value };
  }
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  abort: () => void;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const subscribeToBrowser = () => () => {};
const getBrowserSnapshot = () => true;
const getServerSnapshot = () => false;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function SpeakButton({ onTranscript }: { onTranscript: (value: string) => void }) {
  const [listening, setListening] = useState(false);
  const browserReady = useSyncExternalStore(subscribeToBrowser, getBrowserSnapshot, getServerSnapshot);
  const Recognition = browserReady ? getSpeechRecognitionConstructor() : null;

  if (!Recognition) return null;
  const RecognitionCtor = Recognition;

  function start() {
    const recognition = new RecognitionCtor();
    recognition.lang = typeof navigator !== "undefined" && navigator.language?.startsWith("hi") ? "hi-IN" : "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    try {
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={listening}
      aria-label={listening ? "Listening for your answer" : "Speak your answer"}
      className="inline-flex min-h-12 items-center gap-2 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 text-xs font-semibold text-sx-text-muted hover:text-sx-text disabled:opacity-60"
    >
      <span aria-hidden="true">🎙</span>
      {listening ? "Listening…" : "Speak instead"}
    </button>
  );
}

export function IntakeWizard({ order, onIntakeComplete }: { order: IntakeOrder; onIntakeComplete: () => void }) {
  const initial = useMemo(() => initialAnswers(order), [order]);
  const initialMeta = objectValue(objectValue(order.deep_dive_answers).intakeMeta);
  const [answers, setAnswers] = useState<AnswerMap>(initial);
  const [started, setStarted] = useState(() => typeof initialMeta.lastStepId === "string");
  const [currentStepId, setCurrentStepId] = useState(() => {
    const visible = STEPS.filter((step) => !step.showWhen || step.showWhen(initial));
    const last = typeof initialMeta.lastStepId === "string" ? initialMeta.lastStepId : "";
    const lastIndex = visible.findIndex((step) => step.id === last);
    if (lastIndex >= 0) return visible[Math.min(lastIndex + 1, visible.length - 1)].id;
    const firstMissingRequired = visible.find((step) => step.required && !hasAnswer(initial[step.id]));
    return firstMissingRequired?.id ?? visible[0].id;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSteps = useMemo(
    () => STEPS.filter((step) => !step.showWhen || step.showWhen(answers)),
    [answers],
  );
  const currentIndex = Math.max(0, visibleSteps.findIndex((step) => step.id === currentStepId));
  const currentStep = visibleSteps[currentIndex] ?? visibleSteps[0];
  const progress = visibleSteps.length > 0 ? Math.round(((currentIndex + 1) / visibleSteps.length) * 100) : 0;

  function setAnswer(id: string, value: AnswerValue) {
    setError(null);
    setAnswers((current) => ({ ...current, [id]: value }));
  }

  function toggleMulti(step: IntakeStep, option: string) {
    const selected = arrayValue(answers[step.id]);
    const exists = selected.includes(option);
    if (exists) {
      setAnswer(step.id, selected.filter((item) => item !== option));
      return;
    }
    if (step.maxSelections && selected.length >= step.maxSelections) {
      setError(`Choose up to ${step.maxSelections}.`);
      return;
    }
    if (step.id === "currentMarketing" && option === "nothing") {
      setAnswer(step.id, ["nothing"]);
      return;
    }
    setAnswer(step.id, [...selected.filter((item) => item !== "nothing"), option]);
  }

  async function persistStep(step: IntakeStep): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/intake", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: step.phase, stepId: step.id, data: saveData(step, answers) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Could not save. Please try again.");
        return false;
      }
      return true;
    } catch {
      setError("Network error saving your answer. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function finishIntake() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/audit/intake", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(body.missingFields) && body.missingFields.length > 0) {
          const missing = body.missingFields[0] as string;
          const stepId = missing === "business_name" ? "businessName" : missing;
          const step = visibleSteps.find((candidate) => candidate.id === stepId);
          if (step) setCurrentStepId(step.id);
        }
        setError(body.error ?? "Could not finish your Business Profile. Please try again.");
        return;
      }
      trackFunnel("audit_goals_completed", { surface: "audit_brand_brain_intake" });
      trackFunnel("audit_started", { surface: "audit_brand_brain_intake" });
      onIntakeComplete();
    } catch {
      setError("Network error starting your Audit. Your saved answers are safe; please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    const value = answers[currentStep.id];
    if (currentStep.required && !hasAnswer(value)) {
      setError("Please answer this question to continue.");
      return;
    }
    const saved = await persistStep(currentStep);
    if (!saved) return;

    if (currentIndex === visibleSteps.length - 1) {
      await finishIntake();
      return;
    }
    setCurrentStepId(visibleSteps[currentIndex + 1].id);
  }

  async function skip() {
    const saved = await persistStep(currentStep);
    if (!saved) return;
    if (currentIndex === visibleSteps.length - 1) {
      await finishIntake();
      return;
    }
    setCurrentStepId(visibleSteps[currentIndex + 1].id);
  }

  function back() {
    if (currentIndex === 0) {
      setStarted(false);
      return;
    }
    setCurrentStepId(visibleSteps[currentIndex - 1].id);
  }

  const hasKnownBusiness = Boolean(
    (order.business_name && order.business_name !== PLACEHOLDER) ||
    order.website_url ||
    answers.businessDescription ||
    answers.location
  );

  if (!started) {
    return (
      <Card className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl p-5 sm:p-7 lg:p-8">
        <span className="inline-flex rounded-full border border-sx-border bg-sx-surface-2 px-3 py-1 font-sx-mono text-[11px] font-semibold text-sx-text-muted">
          About 3–5 minutes
        </span>
        <CardHeading className="mt-4">
          {hasKnownBusiness ? "Confirm your business details" : "Tell us about your business"}
        </CardHeading>
        <p className="mt-2 text-sm leading-6 text-sx-text-muted">
          {hasKnownBusiness
            ? "We’ve loaded your verified business profile from your onboarding & Brand Brain. Confirm these details or jump straight into your growth goals."
            : "We’ll ask simple questions and turn your answers into your Stratxcel Brand Brain. No marketing jargon and no long form."}
        </p>

        {hasKnownBusiness && (
          <div className="my-5 rounded-sx-md border border-sx-border bg-sx-surface-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-sx-text-subtle">
                Saved Business Profile
              </span>
              <button
                type="button"
                onClick={() => {
                  setStarted(true);
                  setCurrentStepId("businessName");
                }}
                className="text-xs font-medium text-sx-accent hover:underline"
              >
                Edit
              </button>
            </div>
            <div className="mt-3 grid gap-2.5 text-sm sm:grid-cols-2">
              {order.business_name && order.business_name !== PLACEHOLDER && (
                <div>
                  <span className="block text-xs text-sx-text-subtle">Business Name</span>
                  <span className="font-semibold text-sx-text">{order.business_name}</span>
                </div>
              )}
              {order.website_url && (
                <div>
                  <span className="block text-xs text-sx-text-subtle">Website</span>
                  <span className="font-semibold text-sx-accent break-all">{order.website_url}</span>
                </div>
              )}
              {answers.location && (
                <div>
                  <span className="block text-xs text-sx-text-subtle">Location</span>
                  <span className="text-sx-text">{String(answers.location)}</span>
                </div>
              )}
              {answers.businessDescription && (
                <div className="sm:col-span-2">
                  <span className="block text-xs text-sx-text-subtle">Description / Services</span>
                  <span className="text-sx-text text-xs line-clamp-2">{String(answers.businessDescription)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-3 text-sm text-sx-text-muted sm:grid-cols-3">
          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
            <strong className="block text-sx-text">Mostly one tap</strong>
            <span className="mt-1 block text-xs">Choose simple answers where possible.</span>
          </div>
          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
            <strong className="block text-sx-text">Speak if easier</strong>
            <span className="mt-1 block text-xs">Voice input appears when your browser supports it.</span>
          </div>
          <div className="rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3">
            <strong className="block text-sx-text">Saved as you go</strong>
            <span className="mt-1 block text-xs">Close the page and continue later.</span>
          </div>
        </div>

        <Button
          variant="primary"
          size="touch"
          className="mt-6 w-full"
          onClick={() => {
            setStarted(true);
            trackFunnel("audit_intake_started", { surface: "audit_brand_brain_intake" });
          }}
        >
          {hasKnownBusiness ? "Continue to Audit questions →" : "Let’s start →"}
        </Button>
      </Card>
    );
  }

  const value = answers[currentStep.id];
  const selected = arrayValue(value);

  return (
    <Card className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl p-5 sm:p-7 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="font-sx-mono text-[11px] font-semibold uppercase tracking-wider text-sx-text-subtle">
          Question {currentIndex + 1} of {visibleSteps.length}
        </span>
        <span className="text-xs text-sx-text-subtle">Saved as you go</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-sx-surface-3"
        role="progressbar"
        aria-label="Business Profile progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full rounded-full bg-sx-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-7">
        <h2 id="intake-question-title" className="font-sx-sans text-xl font-bold leading-7 text-sx-text sm:text-2xl">{currentStep.title}</h2>
        {currentStep.helper && <p className="mt-2 text-sm leading-6 text-sx-text-muted">{currentStep.helper}</p>}
        {!currentStep.required && <span className="mt-2 inline-block text-xs font-medium text-sx-text-subtle">Optional</span>}
      </div>

      {error && <div className="mt-5"><ErrorState message={error} /></div>}

      <div className="mt-6">
        {currentStep.kind === "text" && (
          <div className="space-y-3">
            <input
              type="text"
              autoFocus
              aria-labelledby="intake-question-title"
              value={stringValue(value)}
              placeholder={currentStep.placeholder}
              onChange={(event: { target: { value: string } }) => setAnswer(currentStep.id, event.target.value)}
              className="min-h-12 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-4 py-3 text-base text-sx-text outline-none placeholder:text-sx-text-subtle focus:border-sx-accent focus:ring-2 focus:ring-sx-accent/20"
            />
            <SpeakButton onTranscript={(transcript) => setAnswer(currentStep.id, transcript)} />
          </div>
        )}

        {currentStep.kind === "textarea" && (
          <div className="space-y-3">
            <textarea
              autoFocus
              aria-labelledby="intake-question-title"
              rows={5}
              value={stringValue(value)}
              placeholder={currentStep.placeholder}
              onChange={(event: { target: { value: string } }) => setAnswer(currentStep.id, event.target.value)}
              className="w-full resize-y rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-4 py-3 text-base leading-6 text-sx-text outline-none placeholder:text-sx-text-subtle focus:border-sx-accent focus:ring-2 focus:ring-sx-accent/20"
            />
            <SpeakButton onTranscript={(transcript) => {
              const current = stringValue(answers[currentStep.id]);
              setAnswer(currentStep.id, current ? `${current}\n${transcript}` : transcript);
            }} />
          </div>
        )}

        {currentStep.kind === "single" && (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-labelledby="intake-question-title">
            {(currentStep.options ?? []).map((option) => {
              const active = value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAnswer(currentStep.id, option.value)}
                  className={`min-h-12 rounded-sx-sm border px-4 py-3 text-left text-sm font-semibold transition-colors ${active ? "border-sx-accent bg-sx-accent/10 text-sx-text" : "border-sx-border-strong bg-sx-surface-2 text-sx-text-muted hover:border-sx-accent/60 hover:text-sx-text"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}

        {currentStep.kind === "multi" && (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-labelledby="intake-question-title">
            {(currentStep.options ?? []).map((option) => {
              const active = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleMulti(currentStep, option.value)}
                  className={`min-h-12 rounded-sx-sm border px-4 py-3 text-left text-sm font-semibold transition-colors ${active ? "border-sx-accent bg-sx-accent/10 text-sx-text" : "border-sx-border-strong bg-sx-surface-2 text-sx-text-muted hover:border-sx-accent/60 hover:text-sx-text"}`}
                >
                  <span className="mr-2" aria-hidden="true">{active ? "✓" : "○"}</span>{option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-sx-border pt-5">
        <Button variant="ghost" size="touch" onClick={back} disabled={saving}>← Back</Button>
        <div className="ml-auto flex items-center gap-2">
          {!currentStep.required && (
            <Button variant="ghost" size="touch" onClick={skip} disabled={saving}>
              Skip for now
            </Button>
          )}
          <Button variant="primary" size="touch" onClick={next} disabled={saving}>
            {saving ? "Saving…" : currentIndex === visibleSteps.length - 1 ? "Create my Brand Brain →" : "Continue →"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
