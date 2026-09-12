import { spawn } from "node:child_process";
import type { McpServerDefinition, McpToolDefinition } from "./types.ts";

export interface McpDiscoveryResult {
  mcpId: string;
  serverName: string;
  serverVersion: string;
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  toolsCount: number;
  tools: McpToolDefinition[];
  resourcesSupported: boolean;
  promptsSupported: boolean;
  discoveredAt: string;
}

/**
 * Standardized protocol discovery runner for stdio MCP servers.
 * Executes JSON-RPC initialize followed by tools/list and schema inspection.
 */
export async function discoverStdioMcp(
  mcp: McpServerDefinition,
  customEnv: Record<string, string | undefined> = {},
  timeoutMs = 10000
): Promise<McpDiscoveryResult> {
  if (!mcp.command) {
    throw new Error(`discoverStdioMcp: MCP '${mcp.mcpId}' has no execution command.`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(mcp.command!, mcp.args ?? [], {
      env: { ...process.env, ...customEnv },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    let initResult: any = null;
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error(`MCP discovery timed out after ${timeoutMs}ms for '${mcp.mcpId}'`));
      }
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.id === 1 && msg.result) {
            initResult = msg.result;
            // Send initialized notification + tools/list
            child.stdin.write(
              JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
            );
            child.stdin.write(
              JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n"
            );
          } else if (msg.id === 2 && msg.result) {
            const toolsList = msg.result.tools ?? [];
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              child.kill();

              const mappedTools: McpToolDefinition[] = toolsList.map((t: any) => ({
                name: t.name,
                description: t.description ?? "",
                inputSchema: t.inputSchema ?? {},
                riskLevel:
                  t.name.includes("delete") || t.name.includes("push") || t.name.includes("drop")
                    ? "destructive"
                    : t.name.includes("create") || t.name.includes("write") || t.name.includes("upload")
                    ? "high"
                    : "read_only",
                confirmationPolicy:
                  t.name.includes("delete") || t.name.includes("push") || t.name.includes("drop")
                    ? "confirmation_required"
                    : "autonomous",
                requiredPermissions: [],
              }));

              resolve({
                mcpId: mcp.mcpId,
                serverName: initResult?.serverInfo?.name ?? mcp.serverName,
                serverVersion: initResult?.serverInfo?.version ?? mcp.version,
                protocolVersion: "2024-11-05",
                capabilities: initResult?.capabilities ?? {},
                toolsCount: mappedTools.length,
                tools: mappedTools,
                resourcesSupported: Boolean(initResult?.capabilities?.resources),
                promptsSupported: Boolean(initResult?.capabilities?.prompts),
                discoveredAt: new Date().toISOString(),
              });
            }
          }
        } catch {}
      }
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    // Send initialize request
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "stratxcel-mcp-auditor", version: "1.0.0" },
        },
      }) + "\n"
    );
  });
}
