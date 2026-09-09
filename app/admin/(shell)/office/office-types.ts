export type AgentState =
  | "WORKING"
  | "THINKING"
  | "WAITING"
  | "BLOCKED"
  | "IDLE"
  | "COMPLETED"
  | "ERROR";

export type DepartmentKey =
  | "executive"
  | "seo"
  | "content"
  | "website"
  | "engineering"
  | "creative"
  | "research"
  | "sales"
  | "crm"
  | "whatsapp"
  | "social"
  | "operations";

export interface LiveWorker {
  id: string;
  key: string;
  name: string;
  role: string;
  department: DepartmentKey;
  departmentLabel: string;
  accentColor: string;
  secondaryColor: string;
  bgGlow: string;
  avatarIcon: string;
  deskPosition: {
    pod: "executive" | "growth" | "build" | "intelligence" | "communications" | "operations";
    index: number;
    col: number;
    row: number;
  };

  state: AgentState;
  statusLabel: string;
  isBackedByRealWorker: boolean;
  workerType?: string;
  lastHeartbeatAt: string | null;
  heartbeatAgeMs: number | null;

  currentMission: {
    id: string;
    goal: string;
    serviceKey: string;
    state: string;
    runId: string | null;
    createdAt: string;
    updatedAt: string;
    stepCount?: number;
    currentStep?: string | null;
    progressPercent?: number;
  } | null;

  recentActivity: Array<{
    timestamp: string;
    description: string;
    type: "info" | "success" | "warning" | "error";
  }>;

  allowedTools: string[];
}

export interface LiveWorkflowEdge {
  id: string;
  fromWorkerId: string;
  toWorkerId: string;
  label: string;
  active: boolean;
  fileType?: "brief" | "code" | "image" | "report" | "message" | "data";
  progress?: number;
}

export interface OfficeTelemetry {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  workers: LiveWorker[];
  workflows: LiveWorkflowEdge[];
  summary: {
    activeCount: number;
    workingCount: number;
    waitingCount: number;
    blockedCount: number;
    idleCount: number;
    errorCount: number;
    allAgentsIdle: boolean;
    lastHeartbeatTime: string | null;
  };
}

export const DEPARTMENT_PALETTES: Record<
  DepartmentKey,
  { accent: string; secondary: string; glow: string; label: string }
> = {
  executive: {
    accent: "#6366f1", // Indigo
    secondary: "#06b6d4", // Cyan
    glow: "rgba(99, 102, 241, 0.25)",
    label: "Executive",
  },
  seo: {
    accent: "#10b981", // Emerald green
    secondary: "#059669",
    glow: "rgba(16, 185, 129, 0.25)",
    label: "SEO & Discovery",
  },
  content: {
    accent: "#f59e0b", // Amber orange
    secondary: "#d97706",
    glow: "rgba(245, 158, 11, 0.25)",
    label: "Content & Editorial",
  },
  website: {
    accent: "#3b82f6", // Cobalt blue
    secondary: "#2563eb",
    glow: "rgba(59, 130, 246, 0.25)",
    label: "Website & Vercel",
  },
  engineering: {
    accent: "#3b82f6",
    secondary: "#1d4ed8",
    glow: "rgba(59, 130, 246, 0.25)",
    label: "Engineering",
  },
  creative: {
    accent: "#8b5cf6", // Purple / Violet
    secondary: "#7c3aed",
    glow: "rgba(139, 92, 246, 0.25)",
    label: "Design & Creative",
  },
  research: {
    accent: "#eab308", // Gold yellow
    secondary: "#ca8a04",
    glow: "rgba(234, 179, 8, 0.25)",
    label: "Market Research",
  },
  sales: {
    accent: "#f43f5e", // Rose / Red
    secondary: "#e11d48",
    glow: "rgba(244, 63, 94, 0.25)",
    label: "Sales & CRM",
  },
  crm: {
    accent: "#f43f5e",
    secondary: "#e11d48",
    glow: "rgba(244, 63, 94, 0.25)",
    label: "CRM",
  },
  whatsapp: {
    accent: "#10b981", // WhatsApp Emerald
    secondary: "#059669",
    glow: "rgba(16, 185, 129, 0.25)",
    label: "WhatsApp Operations",
  },
  social: {
    accent: "#ec4899", // Pink
    secondary: "#db2777",
    glow: "rgba(236, 72, 153, 0.25)",
    label: "Social Autopilot",
  },
  operations: {
    accent: "#06b6d4", // Cyan / Teal
    secondary: "#0891b2",
    glow: "rgba(6, 182, 212, 0.25)",
    label: "Operations & Workers",
  },
};
