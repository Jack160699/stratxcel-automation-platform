export type AgentState =
  // Active execution states
  | "AVAILABLE"
  | "ANALYZING"
  | "PLANNING"
  | "SEARCHING"
  | "WORKING"
  | "GENERATING"
  | "DELEGATING"
  | "MEETING"
  | "HANDOFF"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "HELPING"
  // Honest non-work idle break states
  | "BREAK"
  | "COFFEE"
  | "GAMING"
  | "KITCHEN"
  | "RELAXING"
  // Backwards compatibility aliases
  | "THINKING"
  | "IDLE"
  | "ERROR";

export type WorkerPosture = "SEATED" | "STANDING" | "WALKING" | "CARRYING";

export type WorkerLocation =
  | "DESK"
  | "MEETING_TABLE"
  | "MISSION_BOARD"
  | "COFFEE_LOUNGE"
  | "KITCHEN_BREAK"
  | "GAMING_ROOM"
  | "RELAXATION_AREA"
  | "CEO_SUITE"
  | "SALES_POD"
  | "MARKETING_POD"
  | "RESEARCH_POD"
  | "FINANCE_POD"
  | "OPERATIONS_POD"
  | "ENGINEERING_POD"
  | "PEOPLE_POD"
  | "CRM_POD"
  | "CORRIDOR"
  | "HALLWAY";

export type DepartmentKey =
  | "executive"
  | "sales"
  | "marketing"
  | "research"
  | "finance"
  | "operations"
  | "engineering"
  | "people"
  | "crm"
  | "seo"
  | "content"
  | "website"
  | "creative"
  | "whatsapp"
  | "social";

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
    pod:
      | "executive"
      | "growth"
      | "build"
      | "intelligence"
      | "communications"
      | "operations"
      | "sales"
      | "marketing"
      | "finance"
      | "engineering"
      | "people"
      | "crm";
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

  // Organizational context
  reportsTo?: string;
  helpingWorkerKey?: string;
  shiftStatus?: "AUTONOMOUS_24_7" | "ACTIVE_SHIFT" | "ON_BREAK" | "SCHEDULED";

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

  scheduledMissions?: Array<{
    id: string;
    goal: string;
    scheduledAt: string;
  }>;

  recentActivity: Array<{
    timestamp: string;
    description: string;
    type: "info" | "success" | "warning" | "error";
  }>;

  allowedTools: string[];
}

export interface PhysicalArtifact {
  id: string;
  missionId: string;
  kind: string;
  label: string;
  fromWorkerKey: string;
  toWorkerKey?: string;
  createdAt: string;
}

export interface OfficeMission {
  id: string;
  goal: string;
  serviceKey: string;
  state: string;
  assignedWorkerKey: string;
  assignedWorkerName: string;
  progressPercent: number;
  currentStep?: string | null;
  createdAt: string;
}

export type OfficeEventType =
  | "MISSION_ASSIGNED"
  | "WORKER_ACTIVATED"
  | "WORKER_STATUS_CHANGED"
  | "TASK_COMPLETED"
  | "ARTIFACT_CREATED"
  | "ARTIFACT_HANDOFF"
  | "WORKER_BLOCKED"
  | "MISSION_COMPLETED"
  | "MEETING_CALLED"
  | "MEETING_DELEGATION"
  | "AMBIENT_BREAK"
  | "AMBIENT_WALK";

export interface OfficeEvent {
  id: string;
  type: OfficeEventType;
  timestamp: string;
  workerKey: string;
  targetWorkerKey?: string;
  missionId?: string;
  artifactId?: string;
  label: string;
  importance: "HIGH" | "MEDIUM" | "LOW";
}

export interface LiveWorkflowEdge {
  id: string;
  fromWorkerId: string;
  toWorkerId: string;
  label: string;
  active: boolean;
  fileType?: "brief" | "code" | "image" | "report" | "message" | "data" | "financial";
  progress?: number;
}

export interface LiveActivityItem {
  id: string;
  workerKey: string;
  workerName: string;
  role: string;
  department: DepartmentKey;
  departmentLabel: string;
  state: AgentState;
  missionId?: string;
  missionGoal?: string;
  currentStep?: string | null;
  elapsedTime?: string;
  latestEvent?: string;
  artifactId?: string;
  artifactLabel?: string;
  startedAt: string;
  updatedAt: string;
}

export interface OfficeTelemetry {
  generatedAt: string;
  tenantId: string;
  tenantName: string;
  workers: LiveWorker[];
  workflows: LiveWorkflowEdge[];
  artifacts: PhysicalArtifact[];
  activeMissions: OfficeMission[];
  liveActivities?: LiveActivityItem[];
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
    label: "CEO & Executive",
  },
  sales: {
    accent: "#f43f5e", // Rose
    secondary: "#e11d48",
    glow: "rgba(244, 63, 94, 0.25)",
    label: "Sales & Deals",
  },
  marketing: {
    accent: "#f59e0b", // Amber
    secondary: "#d97706",
    glow: "rgba(245, 158, 11, 0.25)",
    label: "Marketing & Campaigns",
  },
  research: {
    accent: "#eab308", // Gold
    secondary: "#ca8a04",
    glow: "rgba(234, 179, 8, 0.25)",
    label: "Market Research & Intel",
  },
  finance: {
    accent: "#10b981", // Emerald
    secondary: "#059669",
    glow: "rgba(16, 185, 129, 0.25)",
    label: "Finance & Commercial",
  },
  operations: {
    accent: "#06b6d4", // Cyan
    secondary: "#0891b2",
    glow: "rgba(6, 182, 212, 0.25)",
    label: "Operations & Fleet",
  },
  engineering: {
    accent: "#3b82f6", // Cobalt
    secondary: "#1d4ed8",
    glow: "rgba(59, 130, 246, 0.25)",
    label: "Engineering & Enablement",
  },
  people: {
    accent: "#a855f7", // Purple
    secondary: "#9333ea",
    glow: "rgba(168, 85, 247, 0.25)",
    label: "People & HR",
  },
  crm: {
    accent: "#ec4899", // Pink
    secondary: "#db2777",
    glow: "rgba(236, 72, 153, 0.25)",
    label: "CRM & Customer Ops",
  },
  seo: {
    accent: "#10b981",
    secondary: "#059669",
    glow: "rgba(16, 185, 129, 0.25)",
    label: "SEO & Discovery",
  },
  content: {
    accent: "#f59e0b",
    secondary: "#d97706",
    glow: "rgba(245, 158, 11, 0.25)",
    label: "Content & Editorial",
  },
  website: {
    accent: "#3b82f6",
    secondary: "#2563eb",
    glow: "rgba(59, 130, 246, 0.25)",
    label: "Website & Vercel",
  },
  creative: {
    accent: "#8b5cf6",
    secondary: "#7c3aed",
    glow: "rgba(139, 92, 246, 0.25)",
    label: "Design & Creative",
  },
  whatsapp: {
    accent: "#10b981",
    secondary: "#059669",
    glow: "rgba(16, 185, 129, 0.25)",
    label: "WhatsApp Operations",
  },
  social: {
    accent: "#ec4899",
    secondary: "#db2777",
    glow: "rgba(236, 72, 153, 0.25)",
    label: "Social Autopilot",
  },
};
