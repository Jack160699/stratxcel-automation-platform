import http from "node:http";
import { verifyMissionToken, isToolAllowed, type ToolName } from "@stratxcel/hermes";
import { invokeTool, ToolNotAvailableError } from "./tool-handlers.ts";

/**
 * The restricted tool gateway Hermes calls back into — "services/hermes-
 * gateway" in the master brief's target architecture. Every request must
 * carry a valid, unexpired mission token (see @stratxcel/hermes/token.ts)
 * naming the specific tool being called; there is no path by which a
 * caller without a valid token reaches any tenant's data, and no path by
 * which a valid token for mission A's tool set can invoke a tool it wasn't
 * issued for. Not deployed or reachable from anywhere tonight — this is
 * the code, tested via unit tests on the token/tool-handler layer, since
 * no live Supabase project is reachable this session to exercise it
 * end-to-end (see docs/discovery/SUPABASE_DATA_AND_RLS_MAP.md).
 */

const PORT = Number(process.env.PORT ?? 8082);

function readRawBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleToolCall(toolName: string, req: http.IncomingMessage, res: http.ServerResponse) {
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

  const rawBody = await readRawBody(req);
  const input = rawBody ? JSON.parse(rawBody) : {};

  try {
    const result = await invokeTool(toolName as ToolName, { missionId: verified.payload.missionId, tenantId: verified.payload.tenantId }, input);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    if (err instanceof ToolNotAvailableError) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ healthy: true }));
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

  res.writeHead(404);
  res.end();
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`[hermes-gateway] listening on :${PORT}`);
  });
}

export { server };
