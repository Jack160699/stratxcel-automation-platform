"use client";

import { useState, useMemo } from "react";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { AdminStatusDot } from "@/components/admin/ui/AdminStatusDot";
import { AdminEntityRow } from "@/components/admin/ui/AdminEntityRow";
import {
  AdminUniversalDrawer,
  AdminDrawerSection,
  AdminDrawerRow,
} from "@/components/admin/ui/AdminUniversalDrawer";
import { AdminSegmentedControl } from "@/components/admin/ui/AdminSegmentedControl";
import { AdminEmptyState } from "@/components/admin/ui/AdminEmptyState";
import {
  Server,
  Search,
  Layers,
  Terminal,
  Cpu,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Globe,
  Lock,
} from "lucide-react";
import type {
  McpServerDefinition,
  ProviderArchitectureMapping,
  RemoteBridgeSpecification,
  McpStatus,
} from "@stratxcel/connectors";

const STATUS_CONFIG: Record<
  McpStatus,
  { label: string; status: "connected" | "needs_attention" | "waiting" | "paused" | "error" }
> = {
  healthy: { label: "● Healthy & Live", status: "connected" },
  authorized: { label: "● Authorized", status: "connected" },
  configured: { label: "● Configured", status: "connected" },
  auth_required: { label: "● Auth Required", status: "needs_attention" },
  discovered: { label: "● Discovered", status: "waiting" },
  installed: { label: "● Installed", status: "waiting" },
  degraded: { label: "● Degraded", status: "needs_attention" },
  broken: { label: "● Broken", status: "error" },
  unavailable: { label: "○ No Native MCP", status: "paused" },
};

type FilterCategory = "all" | "core_six" | "verified" | "auth_required" | "windows" | "aws_linux" | "no_native";

export function McpManagementClient({
  mcps,
  providerMappings,
  bridges,
}: {
  mcps: readonly McpServerDefinition[];
  providerMappings: readonly ProviderArchitectureMapping[];
  bridges: readonly RemoteBridgeSpecification[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [selectedMcp, setSelectedMcp] = useState<McpServerDefinition | null>(null);
  const [activeTab, setActiveTab] = useState<"registry" | "mapping" | "bridges">("registry");

  // Summary KPIs
  const verifiedCount = useMemo(
    () => mcps.filter((m) => m.status === "healthy" || m.status === "authorized").length,
    [mcps]
  );
  const authRequiredCount = useMemo(
    () => mcps.filter((m) => m.status === "auth_required").length,
    [mcps]
  );
  const noNativeCount = useMemo(
    () => mcps.filter((m) => m.status === "unavailable" || m.classification === "no_native_mcp").length,
    [mcps]
  );
  const windowsCount = useMemo(
    () => mcps.filter((m) => m.executionEnvironment === "windows").length,
    [mcps]
  );
  const linuxCount = useMemo(
    () => mcps.filter((m) => m.executionEnvironment === "aws_linux").length,
    [mcps]
  );
  const CORE_SIX_PROVIDERS = useMemo(
    () => new Set(["AWS", "AWS S3", "Meta Developers", "Supabase", "Vercel", "GitHub", "Google Workspace"]),
    []
  );
  const coreSixCount = useMemo(
    () => mcps.filter((m) => CORE_SIX_PROVIDERS.has(m.provider)).length,
    [mcps, CORE_SIX_PROVIDERS]
  );

  // Filtered MCP list
  const filteredMcps = useMemo(() => {
    return mcps.filter((m) => {
      if (activeFilter === "core_six" && !CORE_SIX_PROVIDERS.has(m.provider)) {
        return false;
      }
      if (activeFilter === "verified" && m.status !== "healthy" && m.status !== "authorized") {
        return false;
      }
      if (activeFilter === "auth_required" && m.status !== "auth_required") {
        return false;
      }
      if (activeFilter === "windows" && m.executionEnvironment !== "windows") {
        return false;
      }
      if (activeFilter === "aws_linux" && m.executionEnvironment !== "aws_linux") {
        return false;
      }
      if (
        activeFilter === "no_native" &&
        m.status !== "unavailable" &&
        m.classification !== "no_native_mcp"
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.serverName.toLowerCase().includes(q);
        const matchId = m.mcpId.toLowerCase().includes(q);
        const matchProvider = m.provider.toLowerCase().includes(q);
        const matchTools = m.supportedTools.some((t) => t.name.toLowerCase().includes(q));
        if (!matchName && !matchId && !matchProvider && !matchTools) return false;
      }

      return true;
    });
  }, [mcps, activeFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <AdminPageHeader
        title="Master MCP Infrastructure"
        description="Unified Model Context Protocol (MCP) registry and execution surface across Founder Windows Workstation, AWS Linux EC2 Runtime, and Vercel Control Plane. Explicitly distinguishes Native Service Connectors from MCP Servers."
        actions={
          <div className="flex items-center gap-3 text-xs text-sx-text-muted">
            <span>
              Total: <b>{mcps.length}</b>
            </span>
            <span>·</span>
            <span className="text-[#5BDCA7]">
              Verified & Healthy: <b>{verifiedCount}</b>
            </span>
            <span>·</span>
            <span className="text-[#F3C55C]">
              Auth Required: <b>{authRequiredCount}</b>
            </span>
            <span>·</span>
            <span className="text-sx-text-subtle">
              No Native MCP: <b>{noNativeCount}</b>
            </span>
          </div>
        }
      />

      {/* Surface Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-sx-border/60 bg-sx-surface-1">
          <div className="flex items-center justify-between text-xs text-sx-text-muted mb-1">
            <span>Windows / Antigravity</span>
            <HardDrive size={14} className="text-blue-400" />
          </div>
          <div className="text-xl font-semibold text-sx-text">
            {windowsCount}{" "}
            <span className="text-xs font-normal text-sx-text-subtle">servers (stdio)</span>
          </div>
          <div className="text-[11px] text-sx-text-subtle mt-1">
            stratxcel-github, stratxcel-browser verified
          </div>
        </div>

        <div className="p-4 rounded-xl border border-sx-border/60 bg-sx-surface-1">
          <div className="flex items-center justify-between text-xs text-sx-text-muted mb-1">
            <span>AWS Linux / Hermes</span>
            <Terminal size={14} className="text-amber-400" />
          </div>
          <div className="text-xl font-semibold text-sx-text">
            {linuxCount}{" "}
            <span className="text-xs font-normal text-sx-text-subtle">servers (Streamable HTTP)</span>
          </div>
          <div className="text-[11px] text-sx-text-subtle mt-1">
            stratxcel gateway active on localhost:8082
          </div>
        </div>

        <div className="p-4 rounded-xl border border-sx-border/60 bg-sx-surface-1">
          <div className="flex items-center justify-between text-xs text-sx-text-muted mb-1">
            <span>Consolidated Auth State</span>
            <ShieldCheck size={14} className="text-emerald-400" />
          </div>
          <div className="text-xl font-semibold text-sx-text">
            {verifiedCount}{" "}
            <span className="text-xs font-normal text-emerald-400">Verified</span> /{" "}
            {authRequiredCount}{" "}
            <span className="text-xs font-normal text-amber-400">Pending</span>
          </div>
          <div className="text-[11px] text-sx-text-subtle mt-1">
            Consolidated bulk authorization phase ready
          </div>
        </div>

        <div className="p-4 rounded-xl border border-sx-border/60 bg-sx-surface-1">
          <div className="flex items-center justify-between text-xs text-sx-text-muted mb-1">
            <span>Architectural Integrity</span>
            <Layers size={14} className="text-purple-400" />
          </div>
          <div className="text-xl font-semibold text-sx-text">
            0 <span className="text-xs font-normal text-sx-text-subtle">Fake MCPs</span>
          </div>
          <div className="text-[11px] text-sx-text-subtle mt-1">
            Direct API / Browser fallbacks enforced
          </div>
        </div>
      </div>

      {/* Navigation Subtabs: Registry vs. Architecture Mapping vs. Remote Bridges */}
      <div className="flex items-center gap-2 border-b border-sx-border/40 pb-2">
        <button
          onClick={() => setActiveTab("registry")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "registry"
              ? "bg-sx-surface-2 text-sx-text border border-sx-border/80"
              : "text-sx-text-muted hover:text-sx-text"
          }`}
        >
          Canonical Registry ({mcps.length})
        </button>
        <button
          onClick={() => setActiveTab("mapping")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "mapping"
              ? "bg-sx-surface-2 text-sx-text border border-sx-border/80"
              : "text-sx-text-muted hover:text-sx-text"
          }`}
        >
          Provider Architecture Mappings ({providerMappings.length})
        </button>
        <button
          onClick={() => setActiveTab("bridges")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === "bridges"
              ? "bg-sx-surface-2 text-sx-text border border-sx-border/80"
              : "text-sx-text-muted hover:text-sx-text"
          }`}
        >
          Remote Bridge Specifications ({bridges.length})
        </button>
      </div>

      {/* Main Tab: Registry */}
      {activeTab === "registry" && (
        <>
          {/* Controls: Search & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-sx-border/70 bg-sx-surface-1 px-3 py-1.5 text-xs text-sx-text-muted w-full sm:w-72">
              <Search size={14} className="text-sx-text-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search MCPs, tools, or providers…"
                className="w-full bg-transparent placeholder:text-sx-text-subtle focus:outline-none"
              />
            </div>

            <AdminSegmentedControl
              value={activeFilter}
              onChange={(v) => setActiveFilter(v as FilterCategory)}
              options={[
                { value: "all", label: "All", badge: mcps.length },
                { value: "core_six", label: "Core Six Fleet", badge: coreSixCount },
                { value: "verified", label: "Verified & Healthy", badge: verifiedCount },
                { value: "auth_required", label: "Auth Required", badge: authRequiredCount },
                { value: "windows", label: "Windows Stdio", badge: windowsCount },
                { value: "aws_linux", label: "AWS Linux", badge: linuxCount },
                { value: "no_native", label: "No Native MCP", badge: noNativeCount },
              ]}
            />
          </div>

          {/* List of MCPs */}
          {filteredMcps.length === 0 ? (
            <AdminEmptyState
              icon={<Server size={20} />}
              title="No MCP servers found"
              description="No servers match your current search or filter criteria."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMcps.map((mcp) => {
                const statusMeta = STATUS_CONFIG[mcp.status] ?? {
                  label: mcp.status,
                  status: "paused" as const,
                };
                return (
                  <div
                    key={mcp.mcpId}
                    onClick={() => setSelectedMcp(mcp)}
                    className="cursor-pointer"
                  >
                    <AdminEntityRow
                      icon={<Server size={16} className="text-sx-accent" />}
                      title={mcp.serverName}
                      subtitle={
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sx-text-muted">{mcp.description}</span>
                          {mcp.fallback.targetConnectorKey && (
                            <span className="text-sx-text-subtle text-[11px]">
                              · Fallback:{" "}
                              <span className="font-mono text-sx-accent">
                                {mcp.fallback.targetConnectorKey}
                              </span>{" "}
                              ({mcp.fallback.preferredFallbackType})
                            </span>
                          )}
                        </span>
                      }
                      meta={
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="rounded-md border border-sx-border/80 bg-sx-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium text-sx-accent">
                            {mcp.provider}
                          </span>
                          <span className="rounded-md border border-sx-border/60 bg-sx-surface-2/60 px-1.5 py-0.5 text-[10px] uppercase text-sx-text-muted">
                            {mcp.executionEnvironment.replace("_", " ")}
                          </span>
                          <span className="rounded-md border border-sx-border/60 bg-sx-surface-2/60 px-1.5 py-0.5 text-[10px] text-sx-text-muted">
                            {mcp.transport}
                          </span>
                          <span className="hidden sm:inline-flex rounded-md border border-sx-border/40 bg-sx-surface-1 px-1.5 py-0.5 text-[9.5px] text-sx-text-subtle">
                            {mcp.supportedTools.length} tools
                          </span>
                          <span className="hidden md:inline-flex rounded-md border border-sx-border/40 bg-sx-surface-1 px-1.5 py-0.5 text-[9.5px] text-sx-text-subtle">
                            {mcp.confirmationPolicy.replace("_", " ")}
                          </span>
                        </div>
                      }
                      status={<AdminStatusDot status={statusMeta.status} customLabel={statusMeta.label} />}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Secondary Tab: Provider Architecture Mappings */}
      {activeTab === "mapping" && (
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl border border-sx-border/70 bg-sx-surface-1 text-xs text-sx-text-muted leading-relaxed">
            <b className="text-sx-text">Architectural Rule:</b> A Service Connector is NOT an MCP
            Server. For every provider, StratXcel defines the authoritative multi-layer path across
            Direct Service API, CLI, MCP Server, and Founder Browser. Hermes autonomously selects the
            optimal route according to capability, health, and confirmation policy.
          </div>

          <div className="overflow-x-auto rounded-xl border border-sx-border/70 bg-sx-surface-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-sx-border/60 bg-sx-surface-2/50 text-sx-text-muted">
                  <th className="p-3 font-semibold">Provider</th>
                  <th className="p-3 font-semibold">Service API</th>
                  <th className="p-3 font-semibold">CLI Tool</th>
                  <th className="p-3 font-semibold">MCP Server</th>
                  <th className="p-3 font-semibold">Browser Surface</th>
                  <th className="p-3 font-semibold">Active Execution Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sx-border/40 text-sx-text">
                {providerMappings.map((map) => (
                  <tr key={map.provider} className="hover:bg-sx-surface-2/30 transition-colors">
                    <td className="p-3 font-medium text-sx-accent">{map.provider}</td>
                    <td className="p-3 text-sx-text-muted">
                      {map.serviceApi.available ? (
                        <span className="font-mono text-emerald-400">{map.serviceApi.type}</span>
                      ) : (
                        <span className="text-sx-text-subtle">None</span>
                      )}
                    </td>
                    <td className="p-3 text-sx-text-muted">
                      {map.cli.available ? (
                        <span className="font-mono text-blue-400">{map.cli.command}</span>
                      ) : (
                        <span className="text-sx-text-subtle">None</span>
                      )}
                    </td>
                    <td className="p-3">
                      {map.mcp.available ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 font-mono text-[11px]">
                          <CheckCircle2 size={11} /> {map.mcp.mcpId}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sx-text-subtle text-[11px]">
                          <AlertCircle size={11} /> No native MCP
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-sx-text-muted">
                      {map.browser.available ? (
                        <span className="text-purple-300">{map.browser.sessionType}</span>
                      ) : (
                        <span className="text-sx-text-subtle">—</span>
                      )}
                    </td>
                    <td className="p-3 text-sx-text-subtle">
                      <span className="font-mono text-sx-text">
                        {map.primaryExecutionEnvironment.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tertiary Tab: Remote Bridge Specifications */}
      {activeTab === "bridges" && (
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl border border-sx-border/70 bg-sx-surface-1 text-xs text-sx-text-muted leading-relaxed">
            <b className="text-sx-text">Remote Bridge & Isolation Architecture:</b> Windows stdio MCPs
            are NEVER exposed over inbound public ports. Instead, Hermes communicates across
            authenticated private network bridges on EC2 (Streamable HTTP on localhost:8082) or via
            the outbound Antigravity Worker queue.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bridges.map((bridge) => (
              <div
                key={bridge.bridgeId}
                className="p-5 rounded-xl border border-sx-border/70 bg-sx-surface-1 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm text-sx-text">{bridge.name}</div>
                  <span className="rounded bg-sx-surface-2 px-2 py-0.5 text-[10.5px] uppercase font-mono text-sx-accent border border-sx-border/60">
                    {bridge.bridgeType}
                  </span>
                </div>
                <div className="text-xs text-sx-text-muted">{bridge.description}</div>
                <div className="border-t border-sx-border/40 pt-3 flex flex-col gap-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-sx-text-subtle">Source Environment:</span>
                    <span className="font-mono text-sx-text">{bridge.sourceEnvironment}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sx-text-subtle">Target Environment:</span>
                    <span className="font-mono text-sx-text">{bridge.targetEnvironment}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sx-text-subtle">Target Endpoint:</span>
                    <span className="font-mono text-amber-400">
                      {bridge.targetEndpoint ?? "None (Outbound Worker)"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sx-text-subtle">Authentication:</span>
                    <span className="font-mono text-emerald-400">{bridge.authMechanism}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sx-text-subtle">Inbound Ports Exposed:</span>
                    <span className="font-mono text-blue-400">
                      {bridge.securityGuarantees.inboundPortsRequired ? "Yes" : "Zero (Fail-Closed)"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Universal Drawer for MCP Server Inspection */}
      {selectedMcp && (
        <AdminUniversalDrawer
          open={Boolean(selectedMcp)}
          title={selectedMcp.serverName}
          subtitle={`MCP Server Definition · ${selectedMcp.provider}`}
          statusBadge={
            <span className="text-[10px] px-2 py-0.5 rounded bg-sx-accent/15 text-sx-accent font-semibold">
              {selectedMcp.status.toUpperCase()}
            </span>
          }
          onClose={() => setSelectedMcp(null)}
        >
          {/* Section: Overview & Classification */}
          <AdminDrawerSection title="Server Specification">
            <AdminDrawerRow label="MCP ID" value={selectedMcp.mcpId} mono />
            <AdminDrawerRow label="Provider" value={selectedMcp.provider} />
            <AdminDrawerRow
              label="Classification"
              value={selectedMcp.classification.replace("_", " ").toUpperCase()}
            />
            <AdminDrawerRow
              label="Execution Environment"
              value={selectedMcp.executionEnvironment.toUpperCase()}
            />
            <AdminDrawerRow
              label="Transport Mechanism"
              value={selectedMcp.transport.toUpperCase()}
            />
            <AdminDrawerRow
              label="Installation Method"
              value={selectedMcp.installationMethod}
            />
            {selectedMcp.command && (
              <AdminDrawerRow label="Command" value={selectedMcp.command} mono />
            )}
            {selectedMcp.args && selectedMcp.args.length > 0 && (
              <AdminDrawerRow
                label="Arguments"
                value={selectedMcp.args.join(" ")}
                mono
              />
            )}
            {selectedMcp.endpointUrl && (
              <AdminDrawerRow label="Endpoint URL" value={selectedMcp.endpointUrl} mono />
            )}
          </AdminDrawerSection>

          {/* Section: Security, Autonomy & Confirmation Policy */}
          <AdminDrawerSection title="Security & Governance Gate">
            <AdminDrawerRow
              label="Authentication Type"
              value={selectedMcp.authenticationType.toUpperCase()}
            />
            <AdminDrawerRow
              label="Secret Model References"
              value={
                selectedMcp.envVarReferences.length > 0
                  ? selectedMcp.envVarReferences.join(", ")
                  : "None (Zero credential storage)"
              }
              mono
            />
            <AdminDrawerRow
              label="Risk Level"
              value={selectedMcp.riskLevel.toUpperCase()}
            />
            <AdminDrawerRow
              label="Confirmation Policy"
              value={selectedMcp.confirmationPolicy.replace("_", " ").toUpperCase()}
            />
          </AdminDrawerSection>

          {/* Section: Fallback Route */}
          <AdminDrawerSection title="Deterministic Fallback Route">
            <AdminDrawerRow
              label="Preferred Fallback"
              value={selectedMcp.fallback.preferredFallbackType.replace("_", " ").toUpperCase()}
            />
            {selectedMcp.fallback.targetConnectorKey && (
              <AdminDrawerRow
                label="Target Connector"
                value={selectedMcp.fallback.targetConnectorKey}
                mono
              />
            )}
            <AdminDrawerRow
              label="Fallback Rationale"
              value={selectedMcp.fallback.description}
            />
          </AdminDrawerSection>

          {/* Section: Supported Tools */}
          <AdminDrawerSection title={`Supported Tools (${selectedMcp.supportedTools.length})`}>
            {selectedMcp.supportedTools.length === 0 ? (
              <div className="text-xs text-sx-text-subtle p-2">
                No tools exposed (Direct API fallback active).
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedMcp.supportedTools.map((tool) => (
                  <div
                    key={tool.name}
                    className="p-2.5 rounded-lg border border-sx-border/60 bg-sx-surface-2/40 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-xs text-sx-accent">
                        {tool.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                          tool.riskLevel === "destructive"
                            ? "bg-red-950/60 text-red-300 border border-red-800/60"
                            : tool.riskLevel === "high"
                            ? "bg-amber-950/60 text-amber-300 border border-amber-800/60"
                            : "bg-sx-surface-1 text-sx-text-subtle"
                        }`}
                      >
                        {tool.riskLevel}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-sx-text-muted">{tool.description}</div>
                    <div className="text-[10px] text-sx-text-subtle flex items-center gap-1 mt-0.5">
                      <span>Policy: {tool.confirmationPolicy}</span>
                      {tool.requiredPermissions.length > 0 && (
                        <span>· Permissions: {tool.requiredPermissions.join(", ")}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminDrawerSection>
        </AdminUniversalDrawer>
      )}
    </div>
  );
}
