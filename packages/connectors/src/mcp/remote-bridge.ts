import type { McpServerDefinition } from "./types.ts";

/**
 * Remote MCP Bridge Specifications & Architecture
 *
 * Defines the secure connection contracts across environments:
 * 1. Hermes (AWS Linux) -> Local Streamable HTTP MCP (Port 8082, localhost-bound, HMAC Bearer).
 * 2. Hermes (AWS Linux) -> Windows Stdio MCPs (NO public inbound ports on Windows!
 *    Windows workstation connects OUTBOUND via Antigravity Worker heartbeat queue,
 *    claims MCP tool execution jobs, executes them locally, and returns verified receipts).
 * 3. Fail-Closed Isolation: Windows stdio MCPs are never exposed directly to external networks.
 */

export interface RemoteBridgeSecurityGuarantees {
  inboundPortsRequired: boolean;
  zeroPublicExposure: boolean;
}

export interface RemoteMcpBridgeConfig {
  bridgeId: string;
  name: string;
  bridgeType: "streamable_http" | "outbound_worker_polling";
  description: string;
  sourceEnvironment: "aws_linux" | "windows";
  targetEnvironment: "aws_linux" | "windows" | "remote";
  transportProtocol: "streamable_http" | "outbound_worker_queue";
  endpointUrl?: string;
  targetEndpoint?: string;
  authMechanism: string;
  authHeaderName?: string;
  requiresOutboundPolling: boolean;
  securityGuarantees: RemoteBridgeSecurityGuarantees;
  isolationGuarantees: string[];
}

export const CANONICAL_MCP_BRIDGES: readonly RemoteMcpBridgeConfig[] = [
  // ── Hermes Gateway Internal MCP Bridge ──────────────────────────────────
  {
    bridgeId: "hermes-to-ec2-local-mcp",
    name: "Hermes Gateway Streamable HTTP Bridge",
    bridgeType: "streamable_http",
    description: "Internal loopback bridge for Hermes on EC2 connecting directly to local Streamable HTTP MCP server on port 8082.",
    sourceEnvironment: "aws_linux",
    targetEnvironment: "aws_linux",
    transportProtocol: "streamable_http",
    endpointUrl: "http://localhost:8082/mcp",
    targetEndpoint: "http://localhost:8082/mcp",
    authMechanism: "bearer_token",
    authHeaderName: "Authorization: Bearer ${STRATXCEL_MCP_BRIDGE_SECRET}",
    requiresOutboundPolling: false,
    securityGuarantees: {
      inboundPortsRequired: false,
      zeroPublicExposure: true,
    },
    isolationGuarantees: [
      "Bound exclusively to loopback (127.0.0.1)",
      "Never exposed on public interface (0.0.0.0)",
      "Layer A transport HMAC secret verification",
      "Layer B per-call mission capability token verification",
    ],
  },

  // ── Windows Workstation Outbound Worker Bridge ─────────────────────────
  {
    bridgeId: "hermes-to-windows-worker-bridge",
    name: "Windows Workstation Outbound Worker Bridge",
    bridgeType: "outbound_worker_polling",
    description: "Secure queue-based bridge allowing AWS Linux Hermes to invoke Windows stdio MCP tools via Antigravity Worker outbound polling without public inbound ports.",
    sourceEnvironment: "aws_linux",
    targetEnvironment: "windows",
    transportProtocol: "outbound_worker_queue",
    targetEndpoint: undefined,
    authMechanism: "queue_jwt_hmac",
    requiresOutboundPolling: true,
    securityGuarantees: {
      inboundPortsRequired: false,
      zeroPublicExposure: true,
    },
    isolationGuarantees: [
      "Zero public inbound ports opened on Founder Windows",
      "Windows workstation initiates strictly outbound HTTPS long-poll",
      "Jobs authenticated via Postgres queue lease tokens",
      "Results verified with cryptographic execution receipt before acceptance",
    ],
  },
];

export function resolveBridgeForMcp(
  mcpOrId: McpServerDefinition | string,
  targetEnv?: string
): RemoteMcpBridgeConfig | undefined {
  const isString = typeof mcpOrId === "string";
  const env = isString
    ? (mcpOrId.includes("github") || mcpOrId.includes("browser") ? "windows" : "aws_linux")
    : mcpOrId.executionEnvironment;
  const transport = isString
    ? (mcpOrId.includes("github") || mcpOrId.includes("browser") ? "stdio" : "streamable_http")
    : mcpOrId.transport;

  if (env === "aws_linux" && transport === "streamable_http") {
    return CANONICAL_MCP_BRIDGES.find((b) => b.bridgeId === "hermes-to-ec2-local-mcp");
  }
  if (env === "windows" && transport === "stdio") {
    return CANONICAL_MCP_BRIDGES.find((b) => b.bridgeId === "hermes-to-windows-worker-bridge");
  }
  return undefined;
}

export const REMOTE_BRIDGE_SPECIFICATIONS = CANONICAL_MCP_BRIDGES;
export type RemoteBridgeSpecification = RemoteMcpBridgeConfig;
