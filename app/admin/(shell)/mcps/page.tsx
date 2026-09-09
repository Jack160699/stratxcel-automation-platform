import type { Metadata } from "next";
import {
  CANONICAL_MCP_REGISTRY,
  CANONICAL_PROVIDER_MAPPINGS,
  REMOTE_BRIDGE_SPECIFICATIONS,
} from "@stratxcel/connectors";
import { McpManagementClient } from "./McpManagementClient";

export const metadata: Metadata = {
  title: "MCP Infrastructure — Stratxcel Admin",
  robots: { index: false, follow: false },
};

export default async function McpManagementPage() {
  return (
    <McpManagementClient
      mcps={CANONICAL_MCP_REGISTRY}
      providerMappings={CANONICAL_PROVIDER_MAPPINGS}
      bridges={REMOTE_BRIDGE_SPECIFICATIONS}
    />
  );
}
