export type HermesCapabilityBlocker =
  | "NOT_CONFIGURED"
  | "NOT_ENTITLED"
  | "AUTH_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "CAPABILITY_UNAVAILABLE"
  | "EXTERNAL_PROVIDER_BLOCKED"
  | "ENGINEERING_REQUIRED"
  | "FAILED";

export interface EngineeringBrief {
  kind: "ENGINEERING_REQUIRED";
  title: string;
  summary: string;
  missingCapability: string;
  whyHermesCannotProceed: string;
  requestedPlatformChange: string;
  outOfScope: string[];
}

export const CORE_PLATFORM_CODING_LOCKED = [
  "Stratxcel core app",
  "Hermes core",
  "Mission Worker",
  "authentication",
  "payments",
  "RBAC",
  "Supabase migrations",
  "WhatsApp infrastructure",
  "AWS infrastructure",
  "Vercel platform infrastructure",
  "security code",
  "core APIs",
  "internal platform architecture",
] as const;

export function isCorePlatformCodingDenied(target: string): boolean {
  const value = target.toLowerCase();
  return CORE_PLATFORM_CODING_LOCKED.some((item) => value.includes(item.toLowerCase()));
}

export function isWebStudioCodingAllowed(target: string): boolean {
  const value = target.toLowerCase();
  return /website|landing page|microsite|campaign page|web section|web studio|customer site/.test(value)
    && !isCorePlatformCodingDenied(target);
}

export function createEngineeringBrief(input: {
  missingCapability: string;
  goal: string;
}): EngineeringBrief {
  return {
    kind: "ENGINEERING_REQUIRED",
    title: `Engineering brief: ${input.missingCapability}`,
    summary: `Hermes cannot execute “${input.goal.slice(0, 180)}” because a platform capability is missing.`,
    missingCapability: input.missingCapability,
    whyHermesCannotProceed: "Hermes is the operating brain. It must not rewrite Stratxcel core code to invent a missing product capability.",
    requestedPlatformChange: `Implement or configure ${input.missingCapability} as a first-party Stratxcel capability, then expose it through the existing capability runtime and approval gates.`,
    outOfScope: [...CORE_PLATFORM_CODING_LOCKED],
  };
}

export interface HermesMissionContext {
  brandName: string | null;
  websiteUrl: string | null;
  recentMissionStates: string[];
  pendingApprovals: number;
}

type QueryClient = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, value: string): {
        order?(col: string, opts: { ascending: boolean }): {
          limit(n: number): PromiseLike<{ data: unknown[] | null }>;
        };
        limit?(n: number): PromiseLike<{ data: unknown[] | null }>;
        maybeSingle?(): PromiseLike<{ data: Record<string, unknown> | null }>;
      };
    };
  };
};

export async function retrieveHermesMissionContext(
  supabase: QueryClient,
  tenantId: string,
): Promise<HermesMissionContext> {
  const versions = await supabase
    .from("brand_brain_versions")
    .select("content")
    .eq("tenant_id", tenantId)
    .order?.("version", { ascending: false })
    ?.limit(1);
  const content = Array.isArray(versions?.data) && versions.data[0] && typeof versions.data[0] === "object"
    ? (versions.data[0] as { content?: Record<string, unknown> }).content
    : null;
  const missions = await supabase.from("missions").select("state").eq("tenant_id", tenantId).order?.("created_at", { ascending: false })?.limit(8);
  const approvals = await supabase.from("approvals").select("id,status").eq("tenant_id", tenantId).limit?.(20);

  return {
    brandName: typeof content?.business_name === "string" ? content.business_name : null,
    websiteUrl: typeof content?.website_url === "string" ? content.website_url : null,
    recentMissionStates: Array.isArray(missions?.data)
      ? missions.data.map((row) => (row && typeof row === "object" && "state" in row ? String((row as { state: unknown }).state) : "UNKNOWN"))
      : [],
    pendingApprovals: Array.isArray(approvals?.data)
      ? approvals.data.filter((row) => row && typeof row === "object" && "status" in row && String((row as { status: unknown }).status).toUpperCase().includes("PEND")).length
      : 0,
  };
}
