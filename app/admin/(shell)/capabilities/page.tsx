import type { Metadata } from "next";
import { requireReleaseAccess } from "@/lib/release/require-release-access";
import { getServiceContext } from "@/lib/social/db-context";
import { CapabilitiesClient, type CapabilityItem } from "./CapabilitiesClient";

export const metadata: Metadata = {
  title: "Capability Registry — Stratxcel Admin",
  robots: { index: false, follow: false },
};

const STATUS_ORDER = [
  "AVAILABLE",
  "AVAILABLE_WITH_CONFIRMATION",
  "REAL_EXPOSED",
  "AUTH_REQUIRED",
  "PARTIAL",
  "REAL_NOT_EXPOSED",
  "NOT_BUILT",
  "EXTERNAL_REQUIRED",
  "DEGRADED",
  "UNAVAILABLE",
  "BROKEN",
] as const;

export default async function CapabilityRegistryPage() {
  await requireReleaseAccess("v2");

  const { supabase } = getServiceContext();
  const [registryRes, connRes] = await Promise.all([
    supabase
      .from("capability_registry")
      .select(
        "capability_key, name, description, category, status, status_notes, external_blocker, agent_tool_name, last_verified_at"
      )
      .order("status", { ascending: true })
      .order("capability_key", { ascending: true }),
    supabase
      .from("connector_connections")
      .select("id, connector_key, status, last_verified_at, discovered_capabilities, metadata, health_status"),
  ]);

  const existingRows = (registryRes.data ?? []) as CapabilityItem[];
  const connections = connRes.data ?? [];

  const fcConn = connections.find((c) => c.connector_key === "founder_computer");
  const fcMetadata = (fcConn?.metadata as Record<string, unknown> | null) ?? {};
  const fcDomains = Array.isArray(fcMetadata.authenticatedDomains) ? (fcMetadata.authenticatedDomains as string[]) : [];
  const isGoogleAuthed =
    Boolean(fcMetadata.authenticatedGoogleAccount) ||
    fcDomains.some((d) => d.toLowerCase().includes("google.com") || d.toLowerCase().includes("accounts.google"));
  const fcHealthy = ["connected", "healthy", "ready"].includes(fcConn?.status ?? "");
  const fcLastVerified = fcConn?.last_verified_at ?? null;

  const googleCapabilities: CapabilityItem[] = [
    {
      capability_key: "image.generate",
      name: "Image Generation",
      description: "Autonomous brand creative and image generation via Google Founder Browser (Imagen / Gemini Pro).",
      category: "Creative Studio",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: isGoogleAuthed
        ? "Google account authenticated inside Founder Browser. Hermes routes autonomous image jobs via Founder Computer."
        : "Requires authenticated Google session in Founder Computer.",
      external_blocker: null,
      agent_tool_name: "generate_image",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Founder Browser",
      fallback: "Gemini API",
      permission: "Autonomous",
      requires_confirmation: false,
    },
    {
      capability_key: "video.generate",
      name: "Video Generation",
      description: "Autonomous high-fidelity video generation via Google Flow / Veo.",
      category: "Creative Studio",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE_WITH_CONFIRMATION" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: "Requires Google AI Pro entitlement. Confirmation gate strictly enforced before generation.",
      external_blocker: null,
      agent_tool_name: "execute_capability",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Founder Browser",
      fallback: "Configured Video Provider",
      permission: "Approval Required",
      requires_confirmation: true,
    },
    {
      capability_key: "antigravity.code",
      name: "Antigravity",
      description: "Agentic software development workspace and execution environment.",
      category: "Engineering & Code",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: "Authorized via Google Founder Computer desktop environment.",
      external_blocker: null,
      agent_tool_name: "execute_capability",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Desktop",
      fallback: "Claude Code / Internal Tooling",
      permission: "Autonomous",
      requires_confirmation: false,
    },
    {
      capability_key: "jules.task",
      name: "Jules",
      description: "Asynchronous coding task agent running against authorized repositories.",
      category: "Engineering & Code",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: "Requires authorized Google session in Founder Computer.",
      external_blocker: null,
      agent_tool_name: "execute_capability",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Founder Browser",
      fallback: "Antigravity",
      permission: "Autonomous",
      requires_confirmation: false,
    },
    {
      capability_key: "drive.browse",
      name: "Google Drive",
      description: "Mission asset storage, organization, upload, and retrieval scoped to company tenant.",
      category: "Workspace & Storage",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: "Strict tenant boundary enforced. Personal Drive root never exposed across tenants.",
      external_blocker: null,
      agent_tool_name: "execute_capability",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Founder Browser",
      fallback: "S3 Vault",
      permission: "Autonomous",
      requires_confirmation: false,
    },
    {
      capability_key: "gemini.chat",
      name: "Gemini Chat & Reasoning",
      description: "Autonomous reasoning and multimodal inspection via authorized Google browser session.",
      category: "Reasoning & Models",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: "Reachable via Founder Computer browser session.",
      external_blocker: null,
      agent_tool_name: "execute_capability",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Founder Browser",
      fallback: "Gemini API",
      permission: "Autonomous",
      requires_confirmation: false,
    },
    {
      capability_key: "aistudio.prompt",
      name: "Google AI Studio",
      description: "Deep reasoning, large context window inspection, and prompt testing.",
      category: "Reasoning & Models",
      status: fcHealthy && isGoogleAuthed ? "AVAILABLE" : isGoogleAuthed ? "DEGRADED" : "AUTH_REQUIRED",
      status_notes: "Reachable via authenticated Google session.",
      external_blocker: null,
      agent_tool_name: "execute_capability",
      last_verified_at: fcLastVerified,
      provider: "Google AI Pro",
      execution_method: "Founder Browser",
      fallback: "API Direct",
      permission: "Autonomous",
      requires_confirmation: false,
    },
  ];

  // Merge: googleCapabilities take precedence over matching keys in existingRows
  const googleKeys = new Set(googleCapabilities.map((g) => g.capability_key));
  const enrichedExisting = existingRows
    .filter((r) => !googleKeys.has(r.capability_key))
    .map((r) => ({
      ...r,
      provider: r.provider ?? "Stratxcel Internal",
      execution_method: r.execution_method ?? "API",
      fallback: r.fallback ?? "Internal Fallback",
      permission: r.permission ?? "Autonomous",
      requires_confirmation: r.requires_confirmation ?? false,
    }));

  const allCapabilities: CapabilityItem[] = [...googleCapabilities, ...enrichedExisting];

  const countsByStatus = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = allCapabilities.filter((r) => r.status === s).length;
    return acc;
  }, {});

  return <CapabilitiesClient capabilities={allCapabilities} countsByStatus={countsByStatus} />;
}
