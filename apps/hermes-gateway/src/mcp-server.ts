import type http from "node:http";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  verifyMissionToken,
  isToolAllowed,
  STRATXCEL_CONTROLLED_TOOLS,
  TOOL_INPUT_SCHEMAS,
  type ToolName,
} from "@stratxcel/hermes";
import { isKillSwitchActive, createServiceClient as createQueueClient } from "@stratxcel/queue";
import { invokeTool, ToolNotAvailableError } from "./tool-handlers.ts";

/**
 * A real, spec-compliant MCP Streamable HTTP server — not a "JSON endpoint
 * that looks like MCP". Built on the official @modelcontextprotocol/sdk
 * (pinned 1.30.0) so it's the exact client-server pairing the deployed
 * Hermes Agent 0.20.0 speaks (confirmed from its own installed source,
 * `/opt/hermes/tools/mcp_tool.py`, which imports
 * `mcp.client.streamable_http.streamablehttp_client` — the official
 * Python MCP SDK's Streamable HTTP client — for any `mcp_servers` entry
 * configured with a `url`, which is exactly how this bridge is registered
 * in Hermes's config.yaml).
 *
 * Registers exactly the 10 StratExcel tools Hermes may call — one call to
 * McpServer.registerTool() per name in TOOL_INPUT_SCHEMAS, nothing more.
 * There is no MCP resources or prompts capability implemented anywhere in
 * this file, so `resources`/`prompts` are simply absent from this server's
 * capabilities — not "disabled by a flag", genuinely not implemented.
 * submit_publish_request/create_website_change_request have no entry in
 * TOOL_INPUT_SCHEMAS and are therefore never registered, full stop — a
 * second, independent enforcement of STRATXCEL_CONTROLLED_TOOLS on top of
 * tool-handlers.ts's own check.
 *
 * TWO-LAYER AUTHORIZATION (see server.ts for Layer A, this file for Layer B):
 *   A. Static transport secret — checked once per HTTP request in
 *      server.ts, before any request reaches this module. Proves "this is
 *      the StratExcel Hermes installation", nothing mission-specific.
 *   B. Mission capability token — a per-call tool argument
 *      (`missionCapability`), verified in every tool handler below via the
 *      exact same verifyMissionToken()/isToolAllowed() already used by the
 *      POST /tools/<name> path. tenantId/missionId are read only from the
 *      verified token payload — never from any other argument the model
 *      could supply — and that is what gets passed to invokeTool(), the
 *      same function POST /tools/<name> calls. No business logic is
 *      duplicated here.
 */

const SERVER_NAME = "stratxcel";
const SERVER_VERSION = "0.1.0";

let _queueClient: ReturnType<typeof createQueueClient> | undefined;
function getQueueClient() {
  if (!_queueClient) _queueClient = createQueueClient();
  return _queueClient;
}

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

/**
 * Every registered tool's actual input schema, as seen over MCP: the
 * tool's own business fields (from schemas.ts) PLUS a required
 * `missionCapability` string. `.strict()` on both layers means an
 * unexpected field anywhere — including someone trying to smuggle a
 * `tenantId`/`missionId` argument — fails schema validation before this
 * handler code ever runs.
 */
export function mcpInputSchema(tool: McpCallableName) {
  return TOOL_INPUT_SCHEMAS[tool].extend({
    missionCapability: z
      .string()
      .min(1)
      .describe("This mission's short-lived capability token. Required. Never reveal or repeat this value in your final output."),
  });
}

export type McpCallableName = keyof typeof TOOL_INPUT_SCHEMAS;

/** Human-readable descriptions surfaced to the model via tools/list — kept in sync with http-adapter.ts's TOOL_DESCRIPTIONS by hand (small, stable list). */
const TOOL_DESCRIPTIONS: Record<McpCallableName, string> = {
  get_brand_context: "Fetch this tenant's current Brand Brain (voice, offers, facts).",
  get_service_definition: "Fetch this mission's service catalogue entry (label/description).",
  create_draft_artifact: "Save a draft output artifact for this mission.",
  update_mission_progress: "Report a human-readable progress update for this mission.",
  request_approval: "Ask a human to approve a sensitive action before taking it.",
  get_approval_status: "Check a previously requested approval's status.",
  create_human_handoff: "Hand this mission off to a human when blocked.",
  query_publication_status: "Check publication status of a prior submission.",
  create_crm_lead: "Record a new CRM lead.",
  attach_research_evidence: "Attach a cited source to this mission's research trail.",
};

/** Read-only per Section 4 — no state anywhere in StratExcel changes as a result of these calls. Everything else is truthfully non-read-only; none are destructive. */
const READ_ONLY_TOOLS = new Set<McpCallableName>(["get_brand_context", "get_service_definition", "get_approval_status", "query_publication_status"]);

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function okResult(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export type McpAuthorizationResult =
  | { ok: true; missionId: string; tenantId: string; allowedTools: readonly string[]; businessArgs: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Steps 1–7 of the Section 6 enforcement pipeline, and the only steps that
 * need neither a database nor invokeTool() — pure signature/expiry/
 * allowlist logic, kept separate specifically so it's unit-testable
 * without mocking a Supabase client (see __tests__/mcp-server.test.ts).
 * `tool` is always the name this handler was registered under — never
 * taken from the request — so this cannot be tricked into authorizing a
 * different tool than the one whose schema the call actually matched.
 */
export function authorizeMcpToolCall(tool: McpCallableName, rawArgs: Record<string, unknown>): McpAuthorizationResult {
  // STRATXCEL_CONTROLLED_TOOLS can never reach here (not registered at
  // all — see the module comment), but this stays as a second,
  // independent check in case a future edit ever widens registration.
  if ((STRATXCEL_CONTROLLED_TOOLS as readonly string[]).includes(tool)) {
    return { ok: false, reason: `Tool '${tool}' is StratExcel-controlled and is not callable by Hermes` };
  }

  const { missionCapability, ...businessArgs } = rawArgs as { missionCapability?: unknown; [key: string]: unknown };

  // The MCP schema layer (mcpInputSchema) already requires this to be a
  // non-empty string before the SDK ever calls this function — this check
  // is deliberate defense in depth for any caller of authorizeMcpToolCall
  // that bypasses schema validation (as this file's own unit tests do, on
  // purpose, to exercise this layer in isolation).
  if (typeof missionCapability !== "string" || missionCapability.length === 0) {
    return { ok: false, reason: "Mission capability rejected: malformed" };
  }

  const verified = verifyMissionToken(missionCapability);
  if (!verified.ok) {
    return { ok: false, reason: `Mission capability rejected: ${verified.reason}` };
  }
  if (!isToolAllowed(verified.payload, tool as ToolName)) {
    return { ok: false, reason: `Tool '${tool}' is not in this mission's allowed tool set` };
  }

  // Defense in depth beyond the schema layer's `.strict()` (which already
  // rejects a tenantId/missionId field on every real call through the SDK):
  // strip them explicitly here too, so identity can never leak into
  // businessArgs even for a caller that bypasses schema validation, as this
  // file's own unit tests deliberately do to exercise this layer alone.
  const { tenantId: _ignoredTenantId, missionId: _ignoredMissionId, ...safeBusinessArgs } = businessArgs;

  return {
    ok: true,
    missionId: verified.payload.missionId,
    tenantId: verified.payload.tenantId,
    allowedTools: verified.payload.allowedTools,
    businessArgs: safeBusinessArgs,
  };
}

/**
 * Steps 8–13: kill switches (Section 7) and the actual invokeTool() call
 * (Section 2 — never duplicated business logic), run only once
 * authorizeMcpToolCall() has already succeeded.
 */
async function handleMcpToolCall(tool: McpCallableName, rawArgs: Record<string, unknown>): Promise<CallToolResult> {
  const correlationId = crypto.randomUUID();

  const authz = authorizeMcpToolCall(tool, rawArgs);
  if (!authz.ok) return errorResult(authz.reason);
  const { missionId, tenantId, allowedTools, businessArgs } = authz;

  const kill = await isKillSwitchActive(getQueueClient(), [
    { scope: "global_hermes" },
    { scope: "worker_type", scopeId: "hermes-gateway" },
    { scope: "tenant", scopeId: tenantId },
    { scope: "mission", scopeId: missionId },
  ]);
  if (kill.active) {
    return errorResult(`Execution is stopped (kill switch active${kill.reason ? `: ${kill.reason}` : ""})`);
  }

  try {
    const result = await invokeTool(
      tool as ToolName,
      { missionId, tenantId, correlationId, allowedTools },
      businessArgs,
    );
    return okResult(result);
  } catch (err) {
    if (err instanceof ToolNotAvailableError) return errorResult(err.message);
    console.error(`[hermes-gateway/mcp] tool call error tool=${tool} correlationId=${correlationId}:`, err);
    return errorResult(`Internal error (correlationId=${correlationId})`);
  }
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  for (const tool of Object.keys(TOOL_INPUT_SCHEMAS) as McpCallableName[]) {
    const schema = mcpInputSchema(tool);
    server.registerTool(
      tool,
      {
        description: TOOL_DESCRIPTIONS[tool],
        inputSchema: schema.shape,
        annotations: {
          readOnlyHint: READ_ONLY_TOOLS.has(tool),
          destructiveHint: false,
        },
      },
      async (args: Record<string, unknown>) => handleMcpToolCall(tool, args)
    );
  }

  return server;
}

// One transport per MCP session (SDK-recommended pattern for stateful
// Streamable HTTP) — Hermes is expected to hold one long-lived session for
// this installation's whole lifetime, calling many missions' tools through
// it one at a time, so the map stays small in practice.
const sessions = new Map<string, StreamableHTTPServerTransport>();

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

/**
 * Entry point server.ts calls for every request under /mcp, AFTER the
 * static transport-secret check (Layer A) has already passed — this
 * function never re-checks that secret; it only implements the MCP
 * protocol itself and Layer B (inside each tool call, above).
 */
export async function handleMcpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const sessionId = req.headers["mcp-session-id"];
  const sessionKey = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  let transport = sessionKey ? sessions.get(sessionKey) : undefined;

  if (!transport) {
    let body: unknown;
    try {
      body = req.method === "POST" ? await readJsonBody(req) : undefined;
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
      return;
    }

    if (req.method === "POST" && isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, transport as StreamableHTTPServerTransport);
        },
        onsessionclosed: (closedSessionId) => {
          sessions.delete(closedSessionId);
        },
      });
      const server = buildMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session; a new session must start with an initialize request" }, id: null }));
    return;
  }

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
      return;
    }
    await transport.handleRequest(req, res, body);
    return;
  }

  // GET (SSE stream resumption) and DELETE (session termination) carry no body.
  await transport.handleRequest(req, res);
}

/** For server.ts's own /health — true only once at least the module loaded cleanly; never touches a session or a secret. */
export function mcpBridgeStatus(): { registeredTools: number; activeSessions: number } {
  return { registeredTools: Object.keys(TOOL_INPUT_SCHEMAS).length, activeSessions: sessions.size };
}
