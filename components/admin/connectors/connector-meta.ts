export interface ConnectorMeta {
  key: string;
  name: string;
  oneLiner: string;
  category: "ai" | "developer" | "communication" | "sales" | "storage" | "payments" | "browser";
  brandColor?: string;
  isFlagship?: boolean;
}

export const CONNECTOR_META_REGISTRY: Record<string, ConnectorMeta> = {
  google_ai_pro: {
    key: "google_ai_pro",
    name: "Google AI Pro",
    oneLiner: "Founder AI, creative and coding resources.",
    category: "ai",
    brandColor: "#4285F4",
    isFlagship: true,
  },
  gemini: {
    key: "gemini",
    name: "Gemini",
    oneLiner: "Programmatic Gemini intelligence and multimodal AI.",
    category: "ai",
    brandColor: "#7A82DA",
  },
  claude: {
    key: "claude",
    name: "Claude",
    oneLiner: "Advanced reasoning and engineering.",
    category: "ai",
    brandColor: "#D97706",
  },
  openrouter: {
    key: "openrouter",
    name: "OpenRouter",
    oneLiner: "Unified AI model routing and LLM gateway.",
    category: "ai",
    brandColor: "#6366F1",
  },
  github: {
    key: "github",
    name: "GitHub",
    oneLiner: "Repositories, source code and development.",
    category: "developer",
    brandColor: "#F0F6FC",
  },
  vercel: {
    key: "vercel",
    name: "Vercel",
    oneLiner: "Edge compute, deployment and web hosting.",
    category: "developer",
    brandColor: "#FFFFFF",
  },
  supabase: {
    key: "supabase",
    name: "Supabase",
    oneLiner: "Database, authentication and backend storage.",
    category: "developer",
    brandColor: "#3ECF8E",
  },
  aws: {
    key: "aws",
    name: "AWS",
    oneLiner: "StratXcel infrastructure and cloud resources.",
    category: "developer",
    brandColor: "#FF9900",
  },
  whatsapp: {
    key: "whatsapp",
    name: "WhatsApp",
    oneLiner: "Founder and customer messaging.",
    category: "communication",
    brandColor: "#25D366",
  },
  telegram: {
    key: "telegram",
    name: "Telegram",
    oneLiner: "Founder and bot messaging channels.",
    category: "communication",
    brandColor: "#229ED9",
  },
  meta: {
    key: "meta",
    name: "Meta",
    oneLiner: "Instagram, Facebook and Meta business tools.",
    category: "communication",
    brandColor: "#0081FB",
  },
  apollo: {
    key: "apollo",
    name: "Apollo",
    oneLiner: "Lead discovery and B2B intelligence.",
    category: "sales",
    brandColor: "#F59E0B",
  },
  google: {
    key: "google",
    name: "Google",
    oneLiner: "Search Console, Analytics and Google tools.",
    category: "sales",
    brandColor: "#4285F4",
  },
  s3: {
    key: "s3",
    name: "Amazon S3",
    oneLiner: "Object storage and media asset synchronization.",
    category: "storage",
    brandColor: "#E25A1C",
  },
  payments: {
    key: "payments",
    name: "Payments",
    oneLiner: "Payment links, checkout and billing gateway.",
    category: "payments",
    brandColor: "#635BFF",
  },
  browser: {
    key: "browser",
    name: "Browser",
    oneLiner: "Web and computer automation.",
    category: "browser",
    brandColor: "#38BDF8",
  },
};

export const CATEGORY_FILTERS = [
  { id: "all", label: "All" },
  { id: "ai", label: "AI" },
  { id: "developer", label: "Developer" },
  { id: "communication", label: "Communication" },
  { id: "sales", label: "Sales" },
  { id: "storage", label: "Storage" },
  { id: "payments", label: "Payments" },
  { id: "browser", label: "Browser" },
] as const;

export type CategoryFilterId = (typeof CATEGORY_FILTERS)[number]["id"];

export function getConnectorMeta(key: string, labelFallback?: string): ConnectorMeta {
  const existing = CONNECTOR_META_REGISTRY[key];
  if (existing) return existing;
  return {
    key,
    name: labelFallback ?? key,
    oneLiner: "External service integration.",
    category: "developer",
  };
}
