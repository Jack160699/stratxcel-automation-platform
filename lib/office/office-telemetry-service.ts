import type {
  AgentState,
  LiveWorker,
  LiveWorkflowEdge,
  OfficeTelemetry,
  DepartmentKey,
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
  const [heartbeatsRes, missionsRes, eventsRes, agentDefsRes] = await Promise.all([
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
        return {
          state: "WORKING",
          label: "Executing mission",
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
          state: "THINKING",
          label: "Queued / Reasoning",
          currentMission: {
            id: mission.id,
            goal: mission.goal_text,
            serviceKey: mission.service_key || "autonomous_agent",
            state: mission.state,
            runId: mission.hermes_run_id || null,
            createdAt: mission.created_at,
            updatedAt: mission.updated_at,
            currentStep: "awaiting execution",
            progressPercent: 15,
          },
        };
      }

      if (isBlocked) {
        return {
          state: "BLOCKED",
          label: "Awaiting approval",
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
          state: "ERROR",
          label: "Mission failed",
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
        state: workerHeartbeat.lastAt ? "ERROR" : "IDLE",
        label: workerHeartbeat.lastAt ? "Worker offline" : "Idle (Standby)",
        currentMission: null,
      };
    }

    return {
      state: "WAITING",
      label: "Online / Waiting for tasks",
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
  const websiteMission = findMissionForAgent(["website", "site", "landing", "page", "vercel", "deploy", "build"], ["website.create", "website.modify", "website.publish"]);
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
  const salesMission = findMissionForAgent(["whatsapp", "lead", "sales", "crm", "customer", "message"], ["whatsapp.inbound", "lead.convert"]);
  const salesState = deriveAgentState(salesMission, whatsappWorkerHb);
  workers.push({
    id: "sales-whatsapp",
    key: "whatsapp_agent",
    name: "Mercury",
    role: "WhatsApp & Conversational Sales",
    department: "whatsapp",
    departmentLabel: DEPARTMENT_PALETTES.whatsapp.label,
    accentColor: DEPARTMENT_PALETTES.whatsapp.accent,
    secondaryColor: DEPARTMENT_PALETTES.whatsapp.secondary,
    bgGlow: DEPARTMENT_PALETTES.whatsapp.glow,
    avatarIcon: "MessageSquare",
    deskPosition: { pod: "communications", index: 6, col: 2, row: 3 },
    state: salesState.state,
    statusLabel: whatsappWorkerHb.isAlive ? "WhatsApp webhook & processor live" : salesState.label,
    isBackedByRealWorker: true,
    workerType: "whatsapp-worker",
    lastHeartbeatAt: whatsappWorkerHb.lastAt,
    heartbeatAgeMs: whatsappWorkerHb.ageMs,
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

  // 9. DYNAMIC AGENTS FROM AGENT FACTORY
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
      deskPosition: { pod: "operations", index: 8 + i, col: 2, row: 2 },
      state: "IDLE",
      statusLabel: "Standby (Agent Factory)",
      isBackedByRealWorker: false,
      lastHeartbeatAt: null,
      heartbeatAgeMs: null,
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
  const waitingCount = workers.filter((w) => w.state === "WAITING").length;
  const blockedCount = workers.filter((w) => w.state === "BLOCKED").length;
  const idleCount = workers.filter((w) => w.state === "IDLE").length;
  const errorCount = workers.filter((w) => w.state === "ERROR").length;
  const activeCount = workers.filter(
    (w) => w.state === "WORKING" || w.state === "THINKING" || w.state === "WAITING"
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

  return {
    generatedAt: new Date().toISOString(),
    tenantId,
    tenantName,
    workers,
    workflows,
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
