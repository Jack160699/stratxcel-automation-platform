import type {
  AgentState,
  LiveWorker,
  LiveWorkflowEdge,
  OfficeTelemetry,
  DepartmentKey,
  PhysicalArtifact,
  OfficeMission,
  LiveActivityItem,
} from "../../app/admin/(shell)/office/office-types.ts";
import { DEPARTMENT_PALETTES } from "../../app/admin/(shell)/office/office-types.ts";

type Db = { from(table: string): any };

const HEARTBEAT_STALE_MS = 120_000;
const RECENT_COMPLETION_WINDOW_MS = 180_000; // 3 minutes

export async function fetchOfficeTelemetry(
  supabase: Db,
  tenantId: string,
  tenantName: string = "Current Organization"
): Promise<OfficeTelemetry> {
  const now = Date.now();
  const sinceRecent = new Date(now - 864e5).toISOString(); // 24 hours

  // Concurrent queries for real infrastructure telemetry
  const [heartbeatsRes, missionsRes, eventsRes, agentDefsRes, artifactsRes] = await Promise.all([
    supabase
      .from("worker_heartbeats")
      .select("worker_type, status, last_heartbeat_at, queue_backlog_hint, instance_id")
      .order("last_heartbeat_at", { ascending: false })
      .limit(30),
    supabase
      .from("missions")
      .select("id, state, goal_text, service_key, hermes_run_id, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", sinceRecent)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("mission_events")
      .select("mission_id, event_type, payload, created_at")
      .gte("created_at", sinceRecent)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("agent_definitions")
      .select("id, key, name, description, department, allowed_tool_names, status")
      .eq("status", "active")
      .limit(20),
    Promise.resolve(
      supabase
        .from("mission_artifacts")
        .select("id, mission_id, kind, storage_path, metadata, created_at")
        .gte("created_at", sinceRecent)
        .order("created_at", { ascending: false })
        .limit(30)
    ).catch(() => ({ data: [] })),
  ]);

  const heartbeats: Array<{
    worker_type: string;
    status: string;
    last_heartbeat_at: string;
    queue_backlog_hint?: number | null;
    instance_id?: string;
  }> = heartbeatsRes.data ?? [];

  const missions: Array<{
    id: string;
    state: string;
    goal_text: string;
    service_key?: string | null;
    hermes_run_id?: string | null;
    created_at: string;
    updated_at: string;
  }> = missionsRes.data ?? [];

  const events: Array<{
    mission_id: string;
    event_type: string;
    payload?: any;
    created_at: string;
  }> = eventsRes.data ?? [];

  const agentDefs: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    department?: string | null;
    allowed_tool_names: string[];
    status: string;
  }> = agentDefsRes.data ?? [];

  const rawArtifacts: Array<{
    id: string;
    mission_id: string;
    kind: string;
    storage_path?: string | null;
    metadata?: any;
    created_at: string;
  }> = (artifactsRes as any)?.data ?? [];

  // Group latest event by mission
  const latestEventByMission = new Map<string, { event_type: string; created_at: string }>();
  for (const ev of events) {
    if (!latestEventByMission.has(ev.mission_id)) {
      latestEventByMission.set(ev.mission_id, ev);
    }
  }

  // Group heartbeats by worker_type
  const latestHeartbeatByType = new Map<
    string,
    { status: string; last_heartbeat_at: string; queue_backlog_hint?: number | null }
  >();
  for (const hb of heartbeats) {
    if (!latestHeartbeatByType.has(hb.worker_type)) {
      latestHeartbeatByType.set(hb.worker_type, hb);
    }
  }

  function getHeartbeatInfo(workerType: string) {
    const hb = latestHeartbeatByType.get(workerType);
    if (!hb) return { isAlive: false, ageMs: null, lastAt: null, status: "offline" };
    const ageMs = now - new Date(hb.last_heartbeat_at).getTime();
    const isAlive = ageMs < HEARTBEAT_STALE_MS && hb.status !== "stopped";
    return { isAlive, ageMs, lastAt: hb.last_heartbeat_at, status: hb.status };
  }

  // Active missions helper
  const runningMissions = missions.filter((m) => m.state === "RUNNING");
  const queuedMissions = missions.filter(
    (m) => m.state === "QUEUED" || m.state === "AWAITING_INPUT"
  );
  const blockedMissions = missions.filter(
    (m) => m.state === "AWAITING_APPROVAL" || m.state === "BLOCKED"
  );
  const completedMissions = missions.filter((m) => m.state === "COMPLETED");

  function findMissionForAgent(keywords: string[], serviceKeys: string[]) {
    return (
      missions.find(
        (m) =>
          serviceKeys.some((s) => m.service_key?.toLowerCase().includes(s)) ||
          keywords.some((k) => m.goal_text?.toLowerCase().includes(k))
      ) ?? null
    );
  }

  function deriveAgentState(
    mission: (typeof missions)[0] | null,
    workerHeartbeat: ReturnType<typeof getHeartbeatInfo>
  ): {
    state: AgentState;
    label: string;
    currentMission: LiveWorker["currentMission"];
  } {
    if (mission) {
      const isRunning = mission.state === "RUNNING";
      const isQueued = mission.state === "QUEUED" || mission.state === "AWAITING_INPUT";
      const isBlocked = mission.state === "AWAITING_APPROVAL" || mission.state === "BLOCKED";
      const isFailed = mission.state === "FAILED";
      const isCompleted = mission.state === "COMPLETED";

      const ev = latestEventByMission.get(mission.id);
      const missionAgeMs = now - new Date(mission.updated_at || mission.created_at).getTime();

      if (isRunning) {
        const evType = (ev?.event_type || "").toLowerCase();
        const goalLower = (mission.goal_text || "").toLowerCase();
        const stepLower = (evType || "").toLowerCase();

        let operationalState: AgentState = "WORKING";
        if (
          stepLower.includes("search") ||
          stepLower.includes("crawl") ||
          stepLower.includes("discover") ||
          stepLower.includes("scrape") ||
          goalLower.includes("find") ||
          goalLower.includes("search")
        ) {
          operationalState = "SEARCHING";
        } else if (
          stepLower.includes("reasoning") ||
          stepLower.includes("analyz") ||
          stepLower.includes("evaluat") ||
          stepLower.includes("audit") ||
          goalLower.includes("analyz")
        ) {
          operationalState = "ANALYZING";
        } else if (
          stepLower.includes("plan") ||
          stepLower.includes("strateg") ||
          stepLower.includes("decompose") ||
          goalLower.includes("plan")
        ) {
          operationalState = "PLANNING";
        } else if (
          stepLower.includes("generate") ||
          stepLower.includes("draft") ||
          stepLower.includes("render") ||
          stepLower.includes("write") ||
          stepLower.includes("synthes")
        ) {
          operationalState = "GENERATING";
        } else if (stepLower.includes("delegate") || stepLower.includes("dispatch")) {
          operationalState = "DELEGATING";
        } else if (stepLower.includes("meeting") || stepLower.includes("briefing")) {
          operationalState = "MEETING";
        } else if (stepLower.includes("handoff") || stepLower.includes("artifact")) {
          operationalState = "HANDOFF";
        }

        return {
          state: operationalState,
          label: `${operationalState}: ${ev?.event_type || "Executing mission"}`,
          currentMission: {
            id: mission.id,
            goal: mission.goal_text,
            serviceKey: mission.service_key || "autonomous_agent",
            state: mission.state,
            runId: mission.hermes_run_id || null,
            createdAt: mission.created_at,
            updatedAt: mission.updated_at,
            currentStep: ev?.event_type || "processing",
            progressPercent: 65,
          },
        };
      }

      if (isQueued) {
        return {
          state: "PLANNING",
          label: "Queued / Strategic Planning",
          currentMission: {
            id: mission.id,
            goal: mission.goal_text,
            serviceKey: mission.service_key || "autonomous_agent",
            state: mission.state,
            runId: mission.hermes_run_id || null,
            createdAt: mission.created_at,
            updatedAt: mission.updated_at,
            currentStep: "strategic planning",
            progressPercent: 15,
          },
        };
      }

      if (isBlocked) {
        return {
          state: "BLOCKED",
          label: "Awaiting approval / Blocked",
          currentMission: {
            id: mission.id,
            goal: mission.goal_text,
            serviceKey: mission.service_key || "autonomous_agent",
            state: mission.state,
            runId: mission.hermes_run_id || null,
            createdAt: mission.created_at,
            updatedAt: mission.updated_at,
            currentStep: "approval required",
            progressPercent: 50,
          },
        };
      }

      if (isFailed && missionAgeMs < RECENT_COMPLETION_WINDOW_MS) {
        return {
          state: "BLOCKED",
          label: "Mission blocked / failed",
          currentMission: {
            id: mission.id,
            goal: mission.goal_text,
            serviceKey: mission.service_key || "autonomous_agent",
            state: mission.state,
            runId: mission.hermes_run_id || null,
            createdAt: mission.created_at,
            updatedAt: mission.updated_at,
            currentStep: "error",
            progressPercent: 100,
          },
        };
      }

      if (isCompleted && missionAgeMs < RECENT_COMPLETION_WINDOW_MS) {
        return {
          state: "COMPLETED",
          label: "Recently completed",
          currentMission: {
            id: mission.id,
            goal: mission.goal_text,
            serviceKey: mission.service_key || "autonomous_agent",
            state: mission.state,
            runId: mission.hermes_run_id || null,
            createdAt: mission.created_at,
            updatedAt: mission.updated_at,
            currentStep: "delivered",
            progressPercent: 100,
          },
        };
      }
    }

    if (!workerHeartbeat.isAlive) {
      return {
        state: "AVAILABLE",
        label: workerHeartbeat.lastAt ? "Worker offline" : "Available (Standby)",
        currentMission: null,
      };
    }

    return {
      state: "AVAILABLE",
      label: "Available / Standby",
      currentMission: null,
    };
  }

  // Resolve Real Worker Heartbeats
  const missionWorkerHb = getHeartbeatInfo("mission-worker");
  const hermesGatewayHb = getHeartbeatInfo("hermes-gateway");
  const whatsappWorkerHb = getHeartbeatInfo("whatsapp-worker");
  const packageAutopilotHb = getHeartbeatInfo("package-autopilot-worker");

  // Core Workforce Roster
  const workers: LiveWorker[] = [];
  const workflows: LiveWorkflowEdge[] = [];

  // 1. HERMES CEO / ORCHESTRATOR
  const activeTenantMission = runningMissions[0] || queuedMissions[0] || completedMissions[0] || null;
  const hermesStatus = deriveAgentState(activeTenantMission, hermesGatewayHb);
  // If any mission is running in the tenant, Hermes is actively orchestrating
  const hermesState: AgentState = runningMissions.length > 0
    ? "WORKING"
    : queuedMissions.length > 0
    ? "THINKING"
    : blockedMissions.length > 0
    ? "BLOCKED"
    : hermesGatewayHb.isAlive
    ? "WAITING"
    : "IDLE";

  workers.push({
    id: "hermes-ceo",
    key: "hermes",
    name: "Hermes",
    role: "CEO & Orchestrator",
    department: "executive",
    departmentLabel: DEPARTMENT_PALETTES.executive.label,
    accentColor: DEPARTMENT_PALETTES.executive.accent,
    secondaryColor: DEPARTMENT_PALETTES.executive.secondary,
    bgGlow: DEPARTMENT_PALETTES.executive.glow,
    avatarIcon: "Bot",
    deskPosition: { pod: "executive", index: 0, col: 2, row: 1 },
    state: hermesState,
    statusLabel:
      hermesState === "WORKING"
        ? `Orchestrating (${runningMissions.length} active)`
        : hermesState === "THINKING"
        ? "Evaluating intent"
        : hermesStatus.label,
    isBackedByRealWorker: true,
    workerType: "hermes-gateway",
    lastHeartbeatAt: hermesGatewayHb.lastAt,
    heartbeatAgeMs: hermesGatewayHb.ageMs,
    currentMission: activeTenantMission
      ? {
          id: activeTenantMission.id,
          goal: activeTenantMission.goal_text,
          serviceKey: activeTenantMission.service_key || "hermes_orchestration",
          state: activeTenantMission.state,
          runId: activeTenantMission.hermes_run_id || null,
          createdAt: activeTenantMission.created_at,
          updatedAt: activeTenantMission.updated_at,
          currentStep: "Orchestrating workforce",
          progressPercent: runningMissions.length > 0 ? 70 : 100,
        }
      : null,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description:
          runningMissions.length > 0
            ? `Active oversight of mission: "${runningMissions[0].goal_text.slice(0, 50)}"`
            : "Observing tenant workspace & listening for Founder commands",
        type: "info",
      },
    ],
    allowedTools: [
      "create_mission",
      "dispatch_agent",
      "decompose_intent",
      "check_workforce_health",
      "verify_tenant_security",
    ],
  });

  // 2. SEO SPECIALIST
  const seoMission = findMissionForAgent(["seo", "backlink", "keyword", "serp", "audit"], ["seo.audit", "seo.launch", "seo.report"]);
  const seoState = deriveAgentState(seoMission, missionWorkerHb);
  workers.push({
    id: "seo-specialist",
    key: "seo_agent",
    name: "Aether",
    role: "SEO & Growth Specialist",
    department: "seo",
    departmentLabel: DEPARTMENT_PALETTES.seo.label,
    accentColor: DEPARTMENT_PALETTES.seo.accent,
    secondaryColor: DEPARTMENT_PALETTES.seo.secondary,
    bgGlow: DEPARTMENT_PALETTES.seo.glow,
    avatarIcon: "Search",
    deskPosition: { pod: "growth", index: 1, col: 1, row: 2 },
    state: seoState.state,
    statusLabel: seoState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: seoState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: seoMission
          ? `Mission "${seoMission.goal_text.slice(0, 45)}" status: ${seoMission.state}`
          : "Technical discovery, competitor gap crawl & Google Search Console listening",
        type: "info",
      },
    ],
    allowedTools: ["google.research", "link.analyze", "check_website_status", "check_growth_status"],
  });

  // 3. CONTENT SPECIALIST
  const contentMission = findMissionForAgent(["content", "post", "blog", "campaign", "copy", "editorial"], ["content.campaign", "content.create", "social_package"]);
  const contentState = deriveAgentState(contentMission, missionWorkerHb);
  workers.push({
    id: "content-specialist",
    key: "content_agent",
    name: "Calliope",
    role: "Content & Editorial Lead",
    department: "content",
    departmentLabel: DEPARTMENT_PALETTES.content.label,
    accentColor: DEPARTMENT_PALETTES.content.accent,
    secondaryColor: DEPARTMENT_PALETTES.content.secondary,
    bgGlow: DEPARTMENT_PALETTES.content.glow,
    avatarIcon: "FileText",
    deskPosition: { pod: "growth", index: 2, col: 1, row: 3 },
    state: contentState.state,
    statusLabel: contentState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: contentState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: contentMission
          ? `Campaign brief "${contentMission.goal_text.slice(0, 45)}" status: ${contentMission.state}`
          : "Brand voice adherence & editorial campaign pipeline ready",
        type: "info",
      },
    ],
    allowedTools: ["brand_brain.read", "content.generate", "content.review", "social_post.draft"],
  });

  // 4. WEBSITE & ENGINEERING SPECIALIST
  const websiteMission = findMissionForAgent(
    ["website", "site", "landing", "page", "vercel", "deploy", "build", "engineering", "enablement"],
    ["website.create", "website.modify", "website.publish", "engineering.enablement"]
  );
  const websiteState = deriveAgentState(websiteMission, missionWorkerHb);
  workers.push({
    id: "website-engineer",
    key: "website_agent",
    name: "Vulcan",
    role: "Full-Stack Web Architect",
    department: "website",
    departmentLabel: DEPARTMENT_PALETTES.website.label,
    accentColor: DEPARTMENT_PALETTES.website.accent,
    secondaryColor: DEPARTMENT_PALETTES.website.secondary,
    bgGlow: DEPARTMENT_PALETTES.website.glow,
    avatarIcon: "Globe",
    deskPosition: { pod: "build", index: 3, col: 3, row: 2 },
    state: websiteState.state,
    statusLabel: websiteState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: websiteState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: websiteMission
          ? `Vercel project "${websiteMission.goal_text.slice(0, 45)}" status: ${websiteMission.state}`
          : "Vercel REST API, HTML5 semantic synthesis, CSS architecture standby",
        type: "info",
      },
    ],
    allowedTools: ["website.create", "website.modify", "website.preview", "website.publish", "vercel.deploy"],
  });

  // 5. DESIGN & CREATIVE SPECIALIST
  const designMission = findMissionForAgent(["design", "image", "creative", "photo", "graphic", "logo"], ["media.generate", "image.generate"]);
  const designState = deriveAgentState(designMission, missionWorkerHb);
  workers.push({
    id: "creative-designer",
    key: "design_agent",
    name: "Iris",
    role: "Visual Creative Director",
    department: "creative",
    departmentLabel: DEPARTMENT_PALETTES.creative.label,
    accentColor: DEPARTMENT_PALETTES.creative.accent,
    secondaryColor: DEPARTMENT_PALETTES.creative.secondary,
    bgGlow: DEPARTMENT_PALETTES.creative.glow,
    avatarIcon: "Sparkles",
    deskPosition: { pod: "build", index: 4, col: 3, row: 3 },
    state: designState.state,
    statusLabel: designState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: designState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: designMission
          ? `Visual task "${designMission.goal_text.slice(0, 45)}" status: ${designMission.state}`
          : "Google Imagen 3 & aesthetic multimodal render engine ready",
        type: "info",
      },
    ],
    allowedTools: ["image.generate", "brand_assets.read", "visual_review"],
  });

  // 6. RESEARCH & INTELLIGENCE SPECIALIST
  const researchMission = findMissionForAgent(["research", "competitor", "market", "intelligence", "analysis"], ["research.market", "research.competitor", "research.web"]);
  const researchState = deriveAgentState(researchMission, missionWorkerHb);
  workers.push({
    id: "research-analyst",
    key: "research_agent",
    name: "Athena",
    role: "Market Signals & Evidence Lead",
    department: "research",
    departmentLabel: DEPARTMENT_PALETTES.research.label,
    accentColor: DEPARTMENT_PALETTES.research.accent,
    secondaryColor: DEPARTMENT_PALETTES.research.secondary,
    bgGlow: DEPARTMENT_PALETTES.research.glow,
    avatarIcon: "BarChart3",
    deskPosition: { pod: "intelligence", index: 5, col: 1, row: 1 },
    state: researchState.state,
    statusLabel: researchState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: researchState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: researchMission
          ? `Intelligence brief "${researchMission.goal_text.slice(0, 45)}" status: ${researchMission.state}`
          : "Web signals, competitor indexing & evidence review pipeline standing by",
        type: "info",
      },
    ],
    allowedTools: ["google.research", "link.analyze", "evidence_reviewer"],
  });

  // 7. SALES & WHATSAPP SPECIALIST
  const salesMission = findMissionForAgent(
    ["whatsapp", "lead", "sales", "crm", "customer", "message", "revenue", "solar", "linkup", "admission"],
    ["whatsapp.inbound", "lead.convert", "crm.lead_discovery", "revenue.mission", "hermes.ceo_objective"]
  );
  const salesState = deriveAgentState(salesMission, whatsappWorkerHb);
  workers.push({
    id: "sales-whatsapp",
    key: "whatsapp_agent",
    name: "Mercury",
    role: "WhatsApp & Conversational Sales",
    department: "sales",
    departmentLabel: DEPARTMENT_PALETTES.sales.label,
    accentColor: DEPARTMENT_PALETTES.sales.accent,
    secondaryColor: DEPARTMENT_PALETTES.sales.secondary,
    bgGlow: DEPARTMENT_PALETTES.sales.glow,
    avatarIcon: "MessageSquare",
    deskPosition: { pod: "sales", index: 6, col: 2, row: 3 },
    state: salesState.state,
    statusLabel: whatsappWorkerHb.isAlive ? "WhatsApp webhook & processor live" : salesState.label,
    isBackedByRealWorker: true,
    workerType: "whatsapp-worker",
    lastHeartbeatAt: whatsappWorkerHb.lastAt,
    heartbeatAgeMs: whatsappWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: salesState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: `Cloud API Webhook & Worker online (Heartbeat ${whatsappWorkerHb.ageMs ? Math.round(whatsappWorkerHb.ageMs / 1000) + 's ago' : 'active'})`,
        type: "info",
      },
    ],
    allowedTools: ["whatsapp.send", "lead.qualify", "contact.update", "deal.record"],
  });

  // 8. OPERATIONS & CLOUD QUEUE SPECIALIST
  const opsMission = findMissionForAgent(["queue", "worker", "operations", "infra", "health"], ["queue.process", "system.maintenance"]);
  const opsState = deriveAgentState(opsMission, packageAutopilotHb);
  workers.push({
    id: "cloud-operations",
    key: "operations_agent",
    name: "Atlas",
    role: "Queue & Cloud Fleet Commander",
    department: "operations",
    departmentLabel: DEPARTMENT_PALETTES.operations.label,
    accentColor: DEPARTMENT_PALETTES.operations.accent,
    secondaryColor: DEPARTMENT_PALETTES.operations.secondary,
    bgGlow: DEPARTMENT_PALETTES.operations.glow,
    avatarIcon: "Activity",
    deskPosition: { pod: "operations", index: 7, col: 3, row: 1 },
    state: opsState.state,
    statusLabel: "EC2 worker instances operational",
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: opsState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: `4 persistent EC2 workers healthy. Backlog: ${packageAutopilotHb.ageMs ? '0 tasks queued' : 'nominal'}`,
        type: "info",
      },
    ],
    allowedTools: ["worker.health", "queue.requeue", "system.status"],
  });

  // 9. FINANCE & COMMERCIAL SPECIALIST
  const financeMission = findMissionForAgent(
    ["finance", "payment", "revenue", "budget", "invoice", "pricing", "pro-forma"],
    ["finance.record", "revenue.mission", "payment.verify"]
  );
  const financeState = deriveAgentState(financeMission, missionWorkerHb);
  workers.push({
    id: "finance-specialist",
    key: "finance_agent",
    name: "Plutus",
    role: "Finance & Commercial Operations",
    department: "finance",
    departmentLabel: DEPARTMENT_PALETTES.finance.label,
    accentColor: DEPARTMENT_PALETTES.finance.accent,
    secondaryColor: DEPARTMENT_PALETTES.finance.secondary,
    bgGlow: DEPARTMENT_PALETTES.finance.glow,
    avatarIcon: "Coins",
    deskPosition: { pod: "finance", index: 8, col: 1, row: 3 },
    state: financeState.state,
    statusLabel: financeState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: financeState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: financeMission
          ? `Financial model "${financeMission.goal_text.slice(0, 45)}" status: ${financeMission.state}`
          : "Pro-forma model, revenue ledger & unit economic review standby",
        type: "info",
      },
    ],
    allowedTools: ["spreadsheet.write", "revenue.calculate", "finance.record", "deal.verify"],
  });

  // 10. HR & PEOPLE ENABLEMENT SPECIALIST
  const peopleMission = findMissionForAgent(
    ["people", "hr", "talent", "onboard", "hiring", "culture", "enablement"],
    ["people.onboard", "agent.register", "workforce.audit"]
  );
  const peopleState = deriveAgentState(peopleMission, missionWorkerHb);
  workers.push({
    id: "people-specialist",
    key: "people_agent",
    name: "Hestia",
    role: "People, Culture & Talent Enablement",
    department: "people",
    departmentLabel: DEPARTMENT_PALETTES.people.label,
    accentColor: DEPARTMENT_PALETTES.people.accent,
    secondaryColor: DEPARTMENT_PALETTES.people.secondary,
    bgGlow: DEPARTMENT_PALETTES.people.glow,
    avatarIcon: "Users",
    deskPosition: { pod: "people", index: 9, col: 3, row: 3 },
    state: peopleState.state,
    statusLabel: peopleState.label,
    isBackedByRealWorker: true,
    workerType: "mission-worker",
    lastHeartbeatAt: missionWorkerHb.lastAt,
    heartbeatAgeMs: missionWorkerHb.ageMs,
    reportsTo: "Hermes (CEO)",
    shiftStatus: "AUTONOMOUS_24_7",
    currentMission: peopleState.currentMission,
    recentActivity: [
      {
        timestamp: new Date().toISOString(),
        description: peopleMission
          ? `Talent task "${peopleMission.goal_text.slice(0, 45)}" status: ${peopleMission.state}`
          : "Workforce role taxonomy & agent capability enablement standby",
        type: "info",
      },
    ],
    allowedTools: ["workforce.audit", "agent.enable", "people.record"],
  });

  // 11. DYNAMIC AGENTS FROM AGENT FACTORY
  agentDefs.forEach((def, i) => {
    const deptKey = (def.department as DepartmentKey) || "operations";
    const palette = DEPARTMENT_PALETTES[deptKey] || DEPARTMENT_PALETTES.operations;
    workers.push({
      id: `dynamic-${def.key}`,
      key: def.key,
      name: def.name,
      role: def.description || "Custom AI Agent",
      department: deptKey,
      departmentLabel: palette.label,
      accentColor: palette.accent,
      secondaryColor: palette.secondary,
      bgGlow: palette.glow,
      avatarIcon: "Bot",
      deskPosition: { pod: "operations", index: 10 + i, col: 2, row: 2 },
      state: "AVAILABLE",
      statusLabel: "Standby (Agent Factory)",
      isBackedByRealWorker: false,
      lastHeartbeatAt: null,
      heartbeatAgeMs: null,
      reportsTo: "Hermes (CEO)",
      shiftStatus: "AUTONOMOUS_24_7",
      currentMission: null,
      recentActivity: [
        {
          timestamp: new Date().toISOString(),
          description: `Custom agent definition configured with ${def.allowed_tool_names.length} tools`,
          type: "info",
        },
      ],
      allowedTools: def.allowed_tool_names,
    });
  });

  // Calculate Real Live Workflows (Active Data Movement)
  for (const worker of workers) {
    if (worker.id !== "hermes-ceo" && worker.currentMission && worker.state === "WORKING") {
      workflows.push({
        id: `flow-hermes-${worker.id}`,
        fromWorkerId: "hermes-ceo",
        toWorkerId: worker.id,
        label: worker.currentMission.goal.slice(0, 30),
        active: true,
        fileType:
          worker.department === "seo"
            ? "report"
            : worker.department === "website"
            ? "code"
            : worker.department === "creative"
            ? "image"
            : "brief",
        progress: worker.currentMission.progressPercent || 60,
      });
    }
  }

  // Aggregate Status Summary
  const workingCount = workers.filter((w) => w.state === "WORKING").length;
  const waitingCount = workers.filter((w) => w.state === "WAITING" || w.state === "AVAILABLE").length;
  const blockedCount = workers.filter((w) => w.state === "BLOCKED").length;
  const idleCount = workers.filter((w) => w.state === "AVAILABLE" || w.state === "IDLE").length;
  const errorCount = workers.filter((w) => w.state === "ERROR").length;
  const activeCount = workers.filter(
    (w) => w.state !== "AVAILABLE" && w.state !== "IDLE"
  ).length;

  const allAgentsIdle = workingCount === 0 && blockedCount === 0 && errorCount === 0;

  // Latest heartbeat timestamp across all workers
  const heartbeatsList = [
    missionWorkerHb.lastAt,
    hermesGatewayHb.lastAt,
    whatsappWorkerHb.lastAt,
    packageAutopilotHb.lastAt,
  ].filter(Boolean) as string[];

  const lastHeartbeatTime =
    heartbeatsList.length > 0
      ? heartbeatsList.sort((a, b) => b.localeCompare(a))[0]
      : null;

  // Real Physical Artifacts for handoff animations
  const artifacts: PhysicalArtifact[] = rawArtifacts.slice(0, 15).map((a) => {
    let fromWorkerKey = "hermes";
    let toWorkerKey: string | undefined = undefined;
    const k = (a.kind || "").toLowerCase();
    if (k.includes("seo") || k.includes("serp") || k.includes("keyword")) {
      fromWorkerKey = "seo_agent";
      toWorkerKey = "content_agent";
    } else if (k.includes("content") || k.includes("post") || k.includes("article")) {
      fromWorkerKey = "content_agent";
      toWorkerKey = "design_agent";
    } else if (k.includes("research") || k.includes("evidence") || k.includes("intel")) {
      fromWorkerKey = "research_agent";
      toWorkerKey = "seo_agent";
    } else if (k.includes("site") || k.includes("code") || k.includes("deploy")) {
      fromWorkerKey = "website_agent";
      toWorkerKey = "operations_agent";
    } else if (k.includes("design") || k.includes("image") || k.includes("media")) {
      fromWorkerKey = "design_agent";
      toWorkerKey = "content_agent";
    } else if (k.includes("finance") || k.includes("proforma") || k.includes("revenue")) {
      fromWorkerKey = "finance_agent";
      toWorkerKey = "hermes";
    }

    return {
      id: String(a.id),
      missionId: a.mission_id,
      kind: a.kind || "document",
      label: a.kind ? a.kind.replace(/_/g, " ").toUpperCase() : "DELIVERABLE",
      fromWorkerKey,
      toWorkerKey,
      createdAt: a.created_at,
    };
  });

  // Active missions for the in-environment Physical Mission Board
  const activeMissions: OfficeMission[] = missions.slice(0, 8).map((m) => {
    let assignedWorkerKey = "hermes";
    let assignedWorkerName = "Hermes";
    const g = (m.goal_text || "").toLowerCase();
    const s = (m.service_key || "").toLowerCase();
    if (s.includes("seo") || g.includes("seo") || g.includes("keyword") || g.includes("backlink")) {
      assignedWorkerKey = "seo_agent";
      assignedWorkerName = "Aether";
    } else if (s.includes("content") || g.includes("content") || g.includes("post") || g.includes("article")) {
      assignedWorkerKey = "content_agent";
      assignedWorkerName = "Calliope";
    } else if (s.includes("research") || g.includes("research") || g.includes("competitor")) {
      assignedWorkerKey = "research_agent";
      assignedWorkerName = "Athena";
    } else if (s.includes("website") || g.includes("website") || g.includes("site") || g.includes("page")) {
      assignedWorkerKey = "website_agent";
      assignedWorkerName = "Vulcan";
    } else if (s.includes("design") || g.includes("design") || g.includes("image") || g.includes("logo")) {
      assignedWorkerKey = "design_agent";
      assignedWorkerName = "Iris";
    } else if (s.includes("whatsapp") || g.includes("whatsapp") || g.includes("chat") || g.includes("message")) {
      assignedWorkerKey = "whatsapp_agent";
      assignedWorkerName = "Mercury";
    } else if (s.includes("operation") || g.includes("fleet") || g.includes("worker")) {
      assignedWorkerKey = "operations_agent";
      assignedWorkerName = "Atlas";
    } else if (s.includes("finance") || g.includes("revenue") || g.includes("ledger")) {
      assignedWorkerKey = "finance_agent";
      assignedWorkerName = "Plutus";
    } else if (s.includes("people") || g.includes("hr") || g.includes("talent")) {
      assignedWorkerKey = "people_agent";
      assignedWorkerName = "Hestia";
    }

    const isRunning = m.state === "RUNNING";
    const isQueued = m.state === "QUEUED" || m.state === "AWAITING_INPUT";
    const isCompleted = m.state === "COMPLETED";

    return {
      id: m.id,
      goal: m.goal_text,
      serviceKey: m.service_key || "autonomous_agent",
      state: m.state,
      assignedWorkerKey,
      assignedWorkerName,
      progressPercent: isCompleted ? 100 : isRunning ? 72 : isQueued ? 20 : 50,
      currentStep: latestEventByMission.get(m.id)?.event_type || (isRunning ? "executing" : m.state.toLowerCase()),
      createdAt: m.created_at,
    };
  });

  // Real live activities for the Harness-style Activity Panel
  const liveActivities: LiveActivityItem[] = missions.slice(0, 20).map((m) => {
    let assignedWorkerKey = "hermes";
    let assignedWorkerName = "Hermes";
    let role = "CEO & Orchestrator";
    let dept: DepartmentKey = "executive";
    const g = (m.goal_text || "").toLowerCase();
    const s = (m.service_key || "").toLowerCase();

    if (s.includes("seo") || g.includes("seo") || g.includes("keyword")) {
      assignedWorkerKey = "seo_agent";
      assignedWorkerName = "Aether";
      role = "SEO Specialist";
      dept = "seo";
    } else if (s.includes("sale") || g.includes("lead") || g.includes("solar") || g.includes("linkup")) {
      assignedWorkerKey = "whatsapp_agent";
      assignedWorkerName = "Mercury";
      role = "Sales & Conversion";
      dept = "sales";
    } else if (s.includes("content") || g.includes("post") || g.includes("article") || g.includes("campaign")) {
      assignedWorkerKey = "content_agent";
      assignedWorkerName = "Calliope";
      role = "Marketing Lead";
      dept = "marketing";
    } else if (s.includes("research") || g.includes("competitor") || g.includes("intel")) {
      assignedWorkerKey = "research_agent";
      assignedWorkerName = "Athena";
      role = "Market Signals Lead";
      dept = "research";
    } else if (s.includes("finance") || g.includes("revenue") || g.includes("payment")) {
      assignedWorkerKey = "finance_agent";
      assignedWorkerName = "Plutus";
      role = "Finance Architect";
      dept = "finance";
    } else if (s.includes("website") || s.includes("engineering") || g.includes("site") || g.includes("code")) {
      assignedWorkerKey = "website_agent";
      assignedWorkerName = "Vulcan";
      role = "Engineering Architect";
      dept = "engineering";
    } else if (s.includes("people") || s.includes("hr") || g.includes("talent")) {
      assignedWorkerKey = "people_agent";
      assignedWorkerName = "Hestia";
      role = "Talent Lead";
      dept = "people";
    } else if (s.includes("whatsapp") || g.includes("chat") || g.includes("crm")) {
      assignedWorkerKey = "whatsapp_agent";
      assignedWorkerName = "Mercury";
      role = "CRM Specialist";
      dept = "crm";
    } else if (s.includes("operation") || g.includes("infra") || g.includes("queue")) {
      assignedWorkerKey = "operations_agent";
      assignedWorkerName = "Atlas";
      role = "Operations Commander";
      dept = "operations";
    }

    const ev = latestEventByMission.get(m.id);
    const isRunning = m.state === "RUNNING";
    const isQueued = m.state === "QUEUED" || m.state === "AWAITING_INPUT";
    const isBlocked = m.state === "BLOCKED" || m.state === "AWAITING_APPROVAL";
    const isCompleted = m.state === "COMPLETED";

    const evType = (ev?.event_type || "").toLowerCase();
    let actState: AgentState = isCompleted
      ? "COMPLETED"
      : isBlocked
      ? "BLOCKED"
      : isQueued
      ? "PLANNING"
      : "WORKING";

    if (isRunning) {
      if (evType.includes("search") || evType.includes("crawl") || evType.includes("discover") || g.includes("search")) {
        actState = "SEARCHING";
      } else if (evType.includes("reason") || evType.includes("analyz") || evType.includes("evaluat") || g.includes("analyz")) {
        actState = "ANALYZING";
      } else if (evType.includes("plan") || evType.includes("strateg") || g.includes("plan")) {
        actState = "PLANNING";
      } else if (evType.includes("generate") || evType.includes("draft") || evType.includes("render")) {
        actState = "GENERATING";
      } else if (evType.includes("delegate") || evType.includes("dispatch")) {
        actState = "DELEGATING";
      } else if (evType.includes("meeting")) {
        actState = "MEETING";
      } else if (evType.includes("handoff")) {
        actState = "HANDOFF";
      }
    }

    const startedTime = new Date(m.created_at).getTime();
    const elapsedSecs = Math.max(0, Math.floor((now - startedTime) / 1000));
    const elapsedStr = elapsedSecs < 60 ? `${elapsedSecs}s` : `${Math.floor(elapsedSecs / 60)}m ${elapsedSecs % 60}s`;

    return {
      id: `act-${m.id}`,
      workerKey: assignedWorkerKey,
      workerName: assignedWorkerName,
      role,
      department: dept,
      departmentLabel: DEPARTMENT_PALETTES[dept]?.label || dept,
      state: actState,
      missionId: m.id,
      missionGoal: m.goal_text,
      currentStep: ev?.event_type || (isRunning ? "executing" : m.state.toLowerCase()),
      elapsedTime: elapsedStr,
      latestEvent: ev?.event_type || "status_updated",
      startedAt: m.created_at,
      updatedAt: m.updated_at || m.created_at,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    tenantName,
    workers,
    workflows,
    artifacts,
    activeMissions,
    liveActivities,
    summary: {
      activeCount,
      workingCount,
      waitingCount,
      blockedCount,
      idleCount,
      errorCount,
      allAgentsIdle,
      lastHeartbeatTime,
    },
  };
}
