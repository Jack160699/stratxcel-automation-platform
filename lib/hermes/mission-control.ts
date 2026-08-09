export type SignalState = "healthy" | "degraded" | "offline" | "unavailable" | "not_monitored";

export interface HermesTelemetry {
  generatedAt: string;
  status: Record<string, { state: SignalState; label: string; detail?: string }>;
  kpis: Record<string, number | null>;
  trends: Array<{ hour: string; success: number; failure: number; missions: number; avgLatencyMs: number | null; tokens: number | null; costCents: number | null }>;
  missions: Array<{ id: string; runId: string | null; state: string; currentStep: string | null; createdAt: string; updatedAt: string; correlationId: string | null }>;
  tools: { registered: number | null; successful: number | null; denied: number | null; authFailures: number | null; avgLatencyMs: number | null; byType: Array<{ name: string; calls: number }> };
  workers: Array<{ type: string; state: SignalState; status: string; lastHeartbeatAt: string | null; backlog: number | null }>;
  killSwitches: Array<{ scope: string; scopeId: string | null; enabled: boolean; reason: string | null; updatedAt: string }>;
  providers: Array<{ provider: string; model: string | null; calls: number; units: number | null; costCents: number | null }>;
  incidents: Array<{ id: string; kind: string; summary: string; occurredAt: string; missionId: string | null }>;
  availability: Record<string, boolean>;
}

const TERMINAL_SUCCESS = new Set(["COMPLETED", "PARTIALLY_COMPLETED"]);
const TERMINAL_FAILURE = new Set(["FAILED", "BLOCKED", "CANCELLED"]);
const ACTIVE = new Set(["QUEUED", "RUNNING", "AWAITING_INPUT", "AWAITING_APPROVAL", "HUMAN_HANDOFF", "RESUMED"]);
const SECRET_KEY = /(secret|token|authorization|api.?key|capabilit|bearer|credential)/i;

export function heartbeatState(last: string | null, reported?: string): SignalState {
  if (!last) return "unavailable";
  const age = Date.now() - new Date(last).getTime();
  if (!Number.isFinite(age) || age > 120_000 || reported === "stopped") return "offline";
  if (age > 45_000 || reported === "degraded") return "degraded";
  return "healthy";
}

export function safeSummary(value: unknown): string {
  if (!value || typeof value !== "object") return "Operational event";
  const record = value as Record<string, unknown>;
  for (const key of ["reason", "error_code", "status", "message", "tool_name"]) {
    if (!SECRET_KEY.test(key) && typeof record[key] === "string") return String(record[key]).slice(0, 180);
  }
  return "Operational event";
}

type Db = { from(table: string): any };
async function optional<T>(promise: PromiseLike<{ data: T | null; error: unknown }>): Promise<{ data: T; ok: boolean }> {
  try { const result = await promise; return { data: (result.data ?? []) as T, ok: !result.error }; }
  catch { return { data: [] as T, ok: false }; }
}

export async function collectHermesTelemetry(db: Db): Promise<HermesTelemetry> {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [missionsQ, queueQ, workersQ, switchesQ, auditQ, usageQ, eventsQ] = await Promise.all([
    optional<any[]>(db.from("missions").select("id,state,hermes_run_id,created_at,updated_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500)),
    optional<any[]>(db.from("queue_jobs").select("id,status,attempt_count,created_at,started_at,completed_at,correlation_id,payload,last_error,job_type").gte("created_at", since).order("created_at", { ascending: false }).limit(500)),
    optional<any[]>(db.from("worker_heartbeats").select("worker_type,status,last_heartbeat_at,queue_backlog_hint").order("last_heartbeat_at", { ascending: false })),
    optional<any[]>(db.from("kill_switches").select("scope,scope_id,enabled,reason,updated_at").order("updated_at", { ascending: false })),
    optional<any[]>(db.from("audit_events").select("id,action,target_type,target_id,metadata,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500)),
    optional<any[]>(db.from("provider_usage_events").select("provider_key,capability,units,cost_cents,metadata,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500)),
    optional<any[]>(db.from("mission_events").select("mission_id,event_type,payload,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500)),
  ]);
  const missions = missionsQ.data; const queue = queueQ.data; const audit = auditQ.data; const usage = usageQ.data;
  const latestEvent = new Map<string, any>(); for (const event of eventsQ.data) if (!latestEvent.has(event.mission_id)) latestEvent.set(event.mission_id, event);
  const queueByMission = new Map<string, any>(); for (const job of queue) { const id = job.payload?.mission_id; if (typeof id === "string" && !queueByMission.has(id)) queueByMission.set(id, job); }
  const today = new Date(); today.setHours(0,0,0,0); const todayMissions = missions.filter(m => new Date(m.created_at) >= today);
  const completed = missions.filter(m => TERMINAL_SUCCESS.has(m.state)); const failed = missions.filter(m => TERMINAL_FAILURE.has(m.state));
  const latencies = queue.filter(j => j.started_at && j.completed_at).map(j => new Date(j.completed_at).getTime()-new Date(j.started_at).getTime()).filter(Number.isFinite).sort((a,b)=>a-b);
  const toolAudit = audit.filter(a => /tool|mcp/i.test(`${a.action} ${a.target_type ?? ""}`));
  const denied = toolAudit.filter(a => /denied|forbidden|permission|capability/i.test(`${a.action} ${safeSummary(a.metadata)}`));
  const authFailures = toolAudit.filter(a => /auth|401|unauthor/i.test(`${a.action} ${safeSummary(a.metadata)}`));
  const toolCounts = new Map<string, number>(); for (const a of toolAudit) { const name = typeof a.metadata?.tool_name === "string" ? a.metadata.tool_name : a.target_type || "unknown"; toolCounts.set(name, (toolCounts.get(name)||0)+1); }
  const providerMap = new Map<string, {provider:string;model:string|null;calls:number;units:number;costCents:number}>();
  for (const u of usage) { const model = typeof u.metadata?.model === "string" ? u.metadata.model : null; const key=`${u.provider_key}:${model??""}`; const row=providerMap.get(key)||{provider:u.provider_key,model,calls:0,units:0,costCents:0}; row.calls++; row.units+=Number(u.units)||0; row.costCents+=Number(u.cost_cents)||0; providerMap.set(key,row); }
  const buckets = new Map<string, any>(); for (let i=167;i>=0;i--) { const d=new Date(Date.now()-i*36e5); d.setMinutes(0,0,0); buckets.set(d.toISOString(),{hour:d.toISOString(),success:0,failure:0,missions:0,latencies:[],tokens:null,costCents:0}); }
  for (const m of missions) { const key=new Date(new Date(m.created_at).setMinutes(0,0,0)).toISOString(); const b=buckets.get(key); if(b){b.missions++; if(TERMINAL_SUCCESS.has(m.state))b.success++; if(TERMINAL_FAILURE.has(m.state))b.failure++;} }
  for (const j of queue) if(j.started_at&&j.completed_at){const key=new Date(new Date(j.created_at).setMinutes(0,0,0)).toISOString(); const b=buckets.get(key); if(b)b.latencies.push(new Date(j.completed_at).getTime()-new Date(j.started_at).getTime());}
  for (const u of usage){const key=new Date(new Date(u.created_at).setMinutes(0,0,0)).toISOString(); const b=buckets.get(key); if(b)b.costCents+=Number(u.cost_cents)||0;}
  const workerLatest = new Map<string, any>(); for (const w of workersQ.data) if(!workerLatest.has(w.worker_type))workerLatest.set(w.worker_type,w);
  const workers=["mission-worker","hermes-gateway"].map(type=>{const w=workerLatest.get(type);return{type,state:heartbeatState(w?.last_heartbeat_at??null,w?.status),status:w?.status??"Unavailable",lastHeartbeatAt:w?.last_heartbeat_at??null,backlog:w?.queue_backlog_hint??null};});
  const missionWorker=workers.find(w=>w.type==="mission-worker")!; const gateway=workers.find(w=>w.type==="hermes-gateway")!;
  const globalKill=switchesQ.data.some(s=>s.scope==="global_hermes"&&s.enabled);
  const incidents=[...queue.filter(j=>["FAILED","DEAD_LETTER","RETRY_SCHEDULED"].includes(j.status)).map(j=>({id:j.id,kind:j.status,summary:safeSummary(j.last_error),occurredAt:j.completed_at||j.created_at,missionId:typeof j.payload?.mission_id==="string"?j.payload.mission_id:null})),...audit.filter(a=>/denied|failure|timeout|error|401|402|5\d\d|reconnect|degraded/i.test(`${a.action} ${safeSummary(a.metadata)}`)).map(a=>({id:a.id,kind:a.action,summary:safeSummary(a.metadata),occurredAt:a.created_at,missionId:a.target_type==="mission"?a.target_id:null}))].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,20);
  return {generatedAt:new Date().toISOString(),status:{engine:{state:globalKill?"offline":gateway.state,label:globalKill?"Kill switch active":gateway.state},missionWorker:{state:missionWorker.state,label:missionWorker.status},mcpGateway:{state:gateway.state,label:gateway.status},provider:{state:usageQ.ok?(usage.length?"healthy":"unavailable"):"unavailable",label:usage.length?`${new Set(usage.map(u=>u.provider_key)).size} active`:"No data"},queue:{state:queueQ.ok?(queue.some(j=>j.status==="DEAD_LETTER")?"degraded":"healthy"):"unavailable",label:queueQ.ok?`${queue.filter(j=>["PENDING","LEASED","RETRY_SCHEDULED"].includes(j.status)).length} active`:"Unavailable"}},kpis:{runsToday:missionsQ.ok?todayMissions.length:null,successRate:missionsQ.ok&&completed.length+failed.length?Math.round(completed.length/(completed.length+failed.length)*1000)/10:null,avgLatencyMs:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):null,p95LatencyMs:latencies.length?latencies[Math.floor((latencies.length-1)*.95)]:null,activeMissions:missionsQ.ok?missions.filter(m=>ACTIVE.has(m.state)).length:null,toolSuccessRate:toolAudit.length?Math.round((toolAudit.length-denied.length)/toolAudit.length*1000)/10:null,deniedToolCalls:auditQ.ok?denied.length:null,retries:queueQ.ok?queue.filter(j=>j.attempt_count>1||j.status==="RETRY_SCHEDULED").length:null,dlq:queueQ.ok?queue.filter(j=>j.status==="DEAD_LETTER").length:null,tokenUsage:null,estimatedCostCents:usageQ.ok?usage.reduce((s,u)=>s+(Number(u.cost_cents)||0),0):null},trends:[...buckets.values()].map(b=>({hour:b.hour,success:b.success,failure:b.failure,missions:b.missions,avgLatencyMs:b.latencies.length?Math.round(b.latencies.reduce((a:number,c:number)=>a+c,0)/b.latencies.length):null,tokens:b.tokens,costCents:usageQ.ok?b.costCents:null})),missions:missions.slice(0,20).map(m=>{const e=latestEvent.get(m.id),q=queueByMission.get(m.id);return{id:m.id,runId:m.hermes_run_id?String(m.hermes_run_id).slice(0,12):null,state:m.state,currentStep:e?.event_type??null,createdAt:m.created_at,updatedAt:m.updated_at,correlationId:q?.correlation_id?String(q.correlation_id).slice(0,12):null};}),tools:{registered:null,successful:auditQ.ok?toolAudit.length-denied.length:null,denied:auditQ.ok?denied.length:null,authFailures:auditQ.ok?authFailures.length:null,avgLatencyMs:null,byType:[...toolCounts].map(([name,calls])=>({name,calls})).sort((a,b)=>b.calls-a.calls)},workers,killSwitches:switchesQ.data.map(s=>({scope:s.scope,scopeId:s.scope_id||null,enabled:s.enabled,reason:s.reason??null,updatedAt:s.updated_at})),providers:[...providerMap.values()],incidents,availability:{missions:missionsQ.ok,queue:queueQ.ok,workers:workersQ.ok,killSwitches:switchesQ.ok,audit:auditQ.ok,providers:usageQ.ok,missionEvents:eventsQ.ok}};
}
