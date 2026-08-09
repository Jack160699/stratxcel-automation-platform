import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { verifyMissionToken, isToolAllowed, type ToolName } from "@stratxcel/hermes";
import { createServiceClient as createQueueClient, isKillSwitchActive, recordWorkerHeartbeat, getWorkerHealth } from "@stratxcel/queue";
import { invokeTool, ToolNotAvailableError } from "./tool-handlers.ts";
import { handleMcpRequest, mcpBridgeStatus } from "./mcp-server.ts";

/**
 * The restricted tool gateway Hermes calls back into — "services/hermes-
 * gateway" in the master brief's target architecture. Every request must
 * carry a valid, unexpired mission token (see @stratxcel/hermes/token.ts)
 * naming the specific tool being called; there is no path by which a
 * caller without a valid token reaches any tenant's data, and no path by
 * which a valid token for mission A's tool set can invoke a tool it wasn't
 * issued for. No arbitrary tenant ID is ever accepted from the request body
 * — tenantId and missionId come only from the verified token.
 */

const PORT = Number(process.env.PORT ?? 8082);
const WORKER_TYPE = "hermes-gateway" as const;
const INSTANCE_ID = `${os.hostname()}-${process.pid}`;
const VERSION = process.env.GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Fail-closed feature gate for the MCP bridge (see mcp-server.ts) — an
 * environment that hasn't configured Hermes's side of the bridge yet must
 * not have this gateway advertise/answer at /mcp at all, so a stale prompt
 * telling a mission "use mcp__stratxcel__..." never meets a 200 OK from a
 * server that silently does something unintended. Off unless explicitly
 * turned on; unset/anything-other-than-"true" is off, matching the same
 * fail-safe convention as HERMES_MODE's own default.
 */
const MCP_BRIDGE_ENABLED = process.env.STRATXCEL_HERMES_MCP_ENABLED === "true";

let _queueClient: ReturnType<typeof createQueueClient> | undefined;
function getQueueClient() {
  if (!_queueClient) _queueClient = createQueueClient();
  return _queueClient;
}

function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function getCorrelationId(req: http.IncomingMessage): string {
  const header = req.headers["x-correlation-id"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return fromHeader && fromHeader.trim() !== "" ? fromHeader.trim() : crypto.randomUUID();
}

/**
 * Layer A of the MCP bridge's two-layer authorization (see mcp-server.ts's
 * module comment for Layer B). A dedicated secret — never
 * HERMES_GATEWAY_SECRET (mission tokens), HERMES_API_KEY (StratExcel ->
 * Hermes), or OPENROUTER_API_KEY (Hermes -> provider) — that only proves
 * "this caller is the StratExcel Hermes installation", nothing
 * mission-specific. Checked once per HTTP request, before the request ever
 * reaches the MCP protocol handler.
 */
export function checkMcpTransportAuth(req: http.IncomingMessage): boolean {
  const secret = process.env.STRATXCEL_MCP_BRIDGE_SECRET;
  if (!secret) return false; // unset secret can never authenticate anything — fail closed.

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length);

  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (providedBuf.length !== secretBuf.length) return false; // timingSafeEqual requires equal lengths; unequal length is itself already a safe, length-only signal.
  return crypto.timingSafeEqual(providedBuf, secretBuf);
}

async function handleToolCall(toolName: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const correlationId = getCorrelationId(req);
  res.setHeader("X-Correlation-Id", correlationId);

  const kill = await isKillSwitchActive(getQueueClient(), [{ scope: "global_hermes" }, { scope: "worker_type", scopeId: WORKER_TYPE }]);
  if (kill.active) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Hermes gateway is stopped (kill switch active)", reason: kill.reason }));
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing bearer token" }));
    return;
  }
  const token = authHeader.slice("Bearer ".length);
  const verified = verifyMissionToken(token);
  if (!verified.ok) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Invalid token: ${verified.reason}` }));
    return;
  }

  if (!isToolAllowed(verified.payload, toolName as ToolName)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Tool '${toolName}' is not in this mission's allowed tool set` }));
    return;
  }

  let input: unknown;
  try {
    const rawBody = await readRawBody(req);
    input = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Malformed JSON body" }));
    return;
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Tool input must be a JSON object" }));
    return;
  }

  try {
    const result = await invokeTool(
      toolName as ToolName,
      // tenantId/missionId come only from the verified, signed token — never
      // from the request body, so no caller can ever name an arbitrary tenant.
      { missionId: verified.payload.missionId, tenantId: verified.payload.tenantId, correlationId },
      input as Record<string, unknown>
    );
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    if (err instanceof ToolNotAvailableError) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    console.error(`[hermes-gateway] tool call error (correlationId=${correlationId}):`, err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal error", correlationId }));
  }
}

async function handleMcpEntry(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (!MCP_BRIDGE_ENABLED) {
    // Fail closed, not fail-open: an unconfigured bridge must look exactly
    // like it doesn't exist, never like an open, unauthenticated one —
    // same 404 an unrecognized path gets.
    res.writeHead(404);
    res.end();
    return;
  }
  const kill = await isKillSwitchActive(getQueueClient(), [{ scope: "global_hermes" }, { scope: "worker_type", scopeId: WORKER_TYPE }]);
  if (kill.active) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Hermes gateway is stopped (kill switch active)", reason: kill.reason }));
    return;
  }
  if (!checkMcpTransportAuth(req)) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing or invalid MCP bridge transport credential" }));
    return;
  }
  await handleMcpRequest(req, res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health" && req.method === "GET") {
    getWorkerHealth(getQueueClient(), WORKER_TYPE)
      .then((report) => {
        const httpStatus = report.status === "unavailable" ? 503 : 200;
        res.writeHead(httpStatus, { "Content-Type": "application/json" });
        // mcp field never includes a secret — just whether the bridge is
        // turned on and, if so, a session count, both harmless to expose.
        res.end(JSON.stringify({ ...report, version: VERSION, mcp: MCP_BRIDGE_ENABLED ? { enabled: true, ...mcpBridgeStatus() } : { enabled: false } }));
      })
      .catch((err) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "unavailable", reason: err instanceof Error ? err.message : String(err) }));
      });
    return;
  }

  const toolMatch = url.pathname.match(/^\/tools\/([a-z_]+)$/);
  if (toolMatch && req.method === "POST") {
    handleToolCall(toolMatch[1], req, res).catch((err) => {
      console.error("[hermes-gateway] tool call error:", err);
      res.writeHead(500);
      res.end();
    });
    return;
  }

  // The MCP bridge (see mcp-server.ts). Streamable HTTP uses POST for
  // JSON-RPC calls, GET for the optional SSE stream, and DELETE for
  // explicit session termination — all three go through the same handler,
  // which dispatches on method itself.
  if (url.pathname === "/mcp" && (req.method === "POST" || req.method === "GET" || req.method === "DELETE")) {
    handleMcpEntry(req, res).catch((err) => {
      console.error("[hermes-gateway] MCP request error:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[hermes-gateway] listening on :${PORT}`);
  });
  recordWorkerHeartbeat(getQueueClient(), { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
    console.error("[hermes-gateway] initial heartbeat failed:", err)
  );
  setInterval(() => {
    recordWorkerHeartbeat(getQueueClient(), { workerType: WORKER_TYPE, instanceId: INSTANCE_ID, status: "idle", version: VERSION }).catch((err) =>
      console.error("[hermes-gateway] heartbeat failed:", err)
    );
  }, HEARTBEAT_INTERVAL_MS);
}

export { server };
