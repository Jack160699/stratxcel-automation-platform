/**
 * The journey's narrative spine. Scene ranges are fractions of total scroll
 * progress — the canvas, camera and DOM overlays all key off the same numbers.
 */

export type SceneId =
  | "identity"
  | "chaos"
  | "capabilities"
  | "agent"
  | "cases"
  | "ecosystem"
  | "explore";

export interface SceneRange {
  id: SceneId;
  /** global progress where the scene begins */
  start: number;
  /** global progress where the scene ends */
  end: number;
  chapter: string;
}

export const SCENES: SceneRange[] = [
  { id: "identity", start: 0.0, end: 0.12, chapter: "01 · Core" },
  { id: "chaos", start: 0.12, end: 0.26, chapter: "02 · Chaos" },
  { id: "capabilities", start: 0.26, end: 0.46, chapter: "03 · Systems" },
  { id: "agent", start: 0.46, end: 0.63, chapter: "04 · Agent" },
  { id: "cases", start: 0.63, end: 0.76, chapter: "05 · Proof" },
  { id: "ecosystem", start: 0.76, end: 0.88, chapter: "06 · One OS" },
  { id: "explore", start: 0.88, end: 1.0, chapter: "07 · Explore" },
];

export const CHAOS_FRAGMENTS = [
  "disconnected software",
  "missed leads",
  "manual follow-ups",
  "a website nobody visits",
  "five tools, zero answers",
  "spreadsheets as a CRM",
  "slow handoffs",
  "invisible pipeline",
];

export interface Capability {
  key: string;
  title: string;
  line: string;
  /** which mini-visual the scene renders */
  visual: "web" | "automation" | "ai" | "brand" | "apps";
}

export const CAPABILITIES: Capability[] = [
  {
    key: "web",
    title: "Websites that build themselves",
    line: "Structure, copy, and conversion logic — assembled, not designed by committee.",
    visual: "web",
  },
  {
    key: "automation",
    title: "Automation that connects everything",
    line: "Your tools stop being islands. Events flow; work happens without you.",
    visual: "automation",
  },
  {
    key: "ai",
    title: "AI that thinks before it acts",
    line: "Agents reason over your business context, then execute — not the other way around.",
    visual: "ai",
  },
  {
    key: "brand",
    title: "Brands engineered to feel premium",
    line: "An empty identity becomes a company people already trust.",
    visual: "brand",
  },
  {
    key: "apps",
    title: "Apps that grow out of sketches",
    line: "From whiteboard to working software while the idea is still warm.",
    visual: "apps",
  },
];

export interface AgentStep {
  label: string;
  detail: string;
}

export const AGENT_STEPS: AgentStep[] = [
  { label: "Prompt", detail: "“Follow up with every lead from yesterday.”" },
  { label: "Thinking", detail: "ranking 34 leads by intent" },
  { label: "Browser", detail: "opening CRM · reading context" },
  { label: "Forms", detail: "12 records updated" },
  { label: "Email", detail: "9 personalised follow-ups sent" },
  { label: "WhatsApp", detail: "5 conversations answered" },
  { label: "Dashboard", detail: "pipeline refreshed in real time" },
  { label: "Done", detail: "34 leads worked · 0 touched by hand" },
];

export interface CaseStudy {
  client: string;
  problem: string;
  transformation: string;
  metric: { value: number; suffix: string; label: string };
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    client: "Local clinic chain",
    problem: "Front desk drowning in WhatsApp enquiries.",
    transformation: "An agent now qualifies, books and reminds — around the clock.",
    metric: { value: 3, suffix: "×", label: "more bookings kept" },
  },
  {
    client: "D2C founder",
    problem: "A beautiful store nobody could find.",
    transformation: "Rebuilt site, automated funnels, connected analytics.",
    metric: { value: 214, suffix: "%", label: "organic traffic growth" },
  },
  {
    client: "Services agency",
    problem: "Leads went cold in a shared inbox.",
    transformation: "Lead intelligence scores and routes every enquiry in seconds.",
    metric: { value: 41, suffix: "%", label: "faster first response" },
  },
];

export const ECOSYSTEM_NODES = [
  "Websites",
  "CRM",
  "AI Agents",
  "Marketing",
  "Automation",
  "Payments",
  "Analytics",
  "Apps",
];

export interface ExploreLink {
  label: string;
  href: string;
  hint: string;
  external?: boolean;
}

export const EXPLORE_LINKS: ExploreLink[] = [
  { label: "System", href: "/system", hint: "the AI OS, explained" },
  { label: "Modules", href: "/modules", hint: "what plugs into your business" },
  { label: "Use cases", href: "/use-cases", hint: "founders · agencies · local" },
  { label: "Agents", href: "/agents", hint: "meet the workforce" },
  { label: "Pricing", href: "/pricing", hint: "simple, staged, honest" },
  {
    label: "Stratxcel AI",
    href: "https://www.stratxcel.ai",
    hint: "open the product",
    external: true,
  },
];
