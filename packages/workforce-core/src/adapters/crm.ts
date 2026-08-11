import type {
  CapabilityProvider,
  ProviderExecuteInput,
  ProviderExecuteResult,
} from "../providers/types.ts";
import { unknownCostUsage } from "../providers/types.ts";
import { buildCapabilityExecutionReceipt } from "./receipts.ts";
import { getCapabilityOperationClass } from "./operation-class.ts";
import { getCapabilityHost, type LooseServiceClient } from "./host.ts";

const CRM_WRITE_OPERATIONS = [
  "create_lead",
  "update_lead_status",
  "append_note",
  "update_lead_metadata",
] as const;
type CrmWriteOperation = (typeof CRM_WRITE_OPERATIONS)[number];

const ALLOWED_LEAD_STATUSES = new Set(["NEW", "CONTACTED", "QUALIFIED", "WON", "LOST"]);
const ALLOWED_LEAD_SOURCES = new Set(["whatsapp", "website_form", "manual", "import"]);

function envConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function resolveCrmClient(): Promise<LooseServiceClient | null> {
  const host = getCapabilityHost();
  if (host.getServiceClient) return (await host.getServiceClient()) as LooseServiceClient;
  if (!envConfigured()) return null;
  const { createServiceClient } = await import("@stratxcel/leads-and-crm");
  return createServiceClient() as unknown as LooseServiceClient;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeLead(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    status: row.status,
    source: row.source,
    contactName: row.contact_name ?? null,
    contactEmail: row.contact_email ?? null,
    hasPhone: Boolean(row.normalized_phone ?? row.contact_phone),
    tags: Array.isArray(row.tags) ? row.tags : [],
    notes: typeof row.notes === "string" ? row.notes.slice(0, 500) : null,
    assignedTo: row.assigned_to ?? null,
    nextFollowUpAt: row.next_follow_up_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

async function findByIdempotency(
  client: LooseServiceClient,
  tenantId: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const { listLeads } = await import("@stratxcel/leads-and-crm");
  const listed = (await listLeads(client as never, tenantId, 100)) as unknown as Record<
    string,
    unknown
  >[];
  return (
    listed.find((row) => {
      if (row.tenant_id !== tenantId) return false;
      return asRecord(row.metadata)?.workforce_idempotency_key === key;
    }) ?? null
  );
}

async function loadOwnedLead(
  client: LooseServiceClient,
  tenantId: string,
  leadId: string,
): Promise<Record<string, unknown> | null> {
  const { listLeads } = await import("@stratxcel/leads-and-crm");
  try {
    const builder = client.from("crm_leads") as {
      select?: (c: string) => {
        eq: (a: string, b: unknown) => {
          eq: (c: string, d: unknown) => {
            maybeSingle: () => Promise<{ data: unknown }>;
          };
        };
      };
    };
    if (typeof builder.select === "function") {
      const { data } = await builder
        .select("*")
        .eq("id", leadId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const row = asRecord(data);
      if (row && row.tenant_id === tenantId) return row;
    }
  } catch {
    // fall through
  }
  const listed = (await listLeads(client as never, tenantId, 100)) as unknown as Record<
    string,
    unknown
  >[];
  return listed.find((r) => r.id === leadId && r.tenant_id === tenantId) ?? null;
}

async function executeCrmRead(
  client: LooseServiceClient,
  input: ProviderExecuteInput,
): Promise<ProviderExecuteResult> {
  const { listLeads, findLeadByNormalizedPhone } = await import("@stratxcel/leads-and-crm");
  const limitRaw = typeof input.input?.limit === "number" ? input.input.limit : 25;
  const limit = Math.max(1, Math.min(100, Math.floor(limitRaw)));
  const leadId = typeof input.input?.leadId === "string" ? input.input.leadId : null;
  const normalizedPhone =
    typeof input.input?.normalizedPhone === "string" ? input.input.normalizedPhone : null;

  let rows: Record<string, unknown>[] = [];
  if (leadId) {
    const owned = await loadOwnedLead(client, input.tenantId, leadId);
    if (!owned) {
      return {
        ok: false,
        providerKey: "crm-supabase",
        errorCategory: "POLICY_BLOCK",
        errorMessage: "TENANT_FORBIDDEN",
        usage: unknownCostUsage({ requests: 0 }),
      };
    }
    rows = [owned];
  } else if (normalizedPhone) {
    const found = await findLeadByNormalizedPhone(
      client as never,
      input.tenantId,
      normalizedPhone,
    );
    rows = found ? [found as unknown as Record<string, unknown>] : [];
  } else {
    rows = (await listLeads(client as never, input.tenantId, limit)) as unknown as Record<
      string,
      unknown
    >[];
  }

  const safe = rows.filter((r) => r.tenant_id === input.tenantId).map(normalizeLead);
  const snapshotId = `crm_snapshot_${crypto.randomUUID()}`;
  const receipt = buildCapabilityExecutionReceipt({
    capability: "crm.read",
    tenantId: input.tenantId,
    missionId: input.missionId,
    requestId: input.requestId,
    providerKey: "crm-supabase",
    operationClass: getCapabilityOperationClass("crm.read"),
    externalMutation: false,
    externalMutationOccurred: false,
    inputArtifactIds: input.inputArtifactIds,
    outputArtifactIds: [snapshotId],
    detail: { kind: "crm_snapshot", leadCount: safe.length, boundedLimit: limit },
  });
  return {
    ok: true,
    providerKey: "crm-supabase",
    providerReference: snapshotId,
    outputArtifactIds: [snapshotId],
    usage: unknownCostUsage({ requests: 1 }),
    receipt: { ...receipt, leads: safe },
  };
}

async function executeCrmWrite(
  client: LooseServiceClient,
  input: ProviderExecuteInput,
): Promise<ProviderExecuteResult> {
  const { createLead, updateLead, updateLeadStatus } = await import("@stratxcel/leads-and-crm");
  const operation = input.input?.operation as string | undefined;
  if (!operation || !(CRM_WRITE_OPERATIONS as readonly string[]).includes(operation)) {
    return {
      ok: false,
      providerKey: "crm-supabase",
      errorCategory: "INVALID_INPUT",
      errorMessage: `crm.write requires operation in: ${CRM_WRITE_OPERATIONS.join(", ")}`,
      usage: unknownCostUsage({ requests: 0 }),
    };
  }
  const op = operation as CrmWriteOperation;
  const idempotencyKey =
    typeof input.input?.idempotencyKey === "string" && input.input.idempotencyKey.trim()
      ? input.input.idempotencyKey.trim()
      : input.requestId;

  if (op === "create_lead") {
    const prior = await findByIdempotency(client, input.tenantId, idempotencyKey);
    if (prior) {
      const receipt = buildCapabilityExecutionReceipt({
        capability: "crm.write",
        tenantId: input.tenantId,
        missionId: input.missionId,
        requestId: input.requestId,
        providerKey: "crm-supabase",
        operationClass: getCapabilityOperationClass("crm.write"),
        externalMutation: true,
        externalMutationOccurred: false,
        approvalUsed: true,
        idempotencyKey,
        inputArtifactIds: input.inputArtifactIds,
        outputArtifactIds: [String(prior.id)],
        providerExternalId: String(prior.id),
        detail: { kind: "crm_write_receipt", operation: op, idempotentReplay: true },
      });
      return {
        ok: true,
        providerKey: "crm-supabase",
        providerReference: String(prior.id),
        outputArtifactIds: [String(prior.id)],
        usage: unknownCostUsage({ requests: 1 }),
        receipt,
      };
    }

    const sourceRaw = typeof input.input?.source === "string" ? input.input.source : "manual";
    if (!ALLOWED_LEAD_SOURCES.has(sourceRaw)) {
      return {
        ok: false,
        providerKey: "crm-supabase",
        errorCategory: "INVALID_INPUT",
        errorMessage: "crm.write source not in allowlist",
        usage: unknownCostUsage({ requests: 0 }),
      };
    }

    const lead = await createLead(client as never, {
      tenantId: input.tenantId,
      source: sourceRaw as never,
      contactName: typeof input.input?.contactName === "string" ? input.input.contactName : null,
      contactEmail: typeof input.input?.contactEmail === "string" ? input.input.contactEmail : null,
      contactPhone: typeof input.input?.contactPhone === "string" ? input.input.contactPhone : null,
      normalizedPhone:
        typeof input.input?.normalizedPhone === "string" ? input.input.normalizedPhone : null,
      metadata: {
        ...(asRecord(input.input?.metadata) ?? {}),
        workforce_idempotency_key: idempotencyKey,
        workforce_mission_id: input.missionId,
        workforce_request_id: input.requestId,
      },
    });

    if ((lead as { tenant_id?: string }).tenant_id !== input.tenantId) {
      return {
        ok: false,
        providerKey: "crm-supabase",
        errorCategory: "POLICY_BLOCK",
        errorMessage: "TENANT_FORBIDDEN",
        usage: unknownCostUsage({ requests: 0 }),
      };
    }

    const receipt = buildCapabilityExecutionReceipt({
      capability: "crm.write",
      tenantId: input.tenantId,
      missionId: input.missionId,
      requestId: input.requestId,
      providerKey: "crm-supabase",
      operationClass: getCapabilityOperationClass("crm.write"),
      externalMutation: true,
      externalMutationOccurred: true,
      approvalUsed: true,
      idempotencyKey,
      inputArtifactIds: input.inputArtifactIds,
      outputArtifactIds: [lead.id],
      providerExternalId: lead.id,
      detail: { kind: "crm_write_receipt", operation: op, idempotentReplay: false },
    });
    return {
      ok: true,
      providerKey: "crm-supabase",
      providerReference: lead.id,
      outputArtifactIds: [lead.id],
      usage: unknownCostUsage({ requests: 1 }),
      receipt,
    };
  }

  const leadId = typeof input.input?.leadId === "string" ? input.input.leadId : null;
  if (!leadId) {
    return {
      ok: false,
      providerKey: "crm-supabase",
      errorCategory: "INVALID_INPUT",
      errorMessage: "crm.write requires leadId for update operations",
      usage: unknownCostUsage({ requests: 0 }),
    };
  }

  const owned = await loadOwnedLead(client, input.tenantId, leadId);
  if (!owned) {
    return {
      ok: false,
      providerKey: "crm-supabase",
      errorCategory: "POLICY_BLOCK",
      errorMessage: "TENANT_FORBIDDEN",
      usage: unknownCostUsage({ requests: 0 }),
    };
  }

  if (op === "update_lead_status") {
    const status = typeof input.input?.status === "string" ? input.input.status.toUpperCase() : "";
    if (!ALLOWED_LEAD_STATUSES.has(status)) {
      return {
        ok: false,
        providerKey: "crm-supabase",
        errorCategory: "INVALID_INPUT",
        errorMessage: "crm.write status not in allowlist",
        usage: unknownCostUsage({ requests: 0 }),
      };
    }
    await updateLeadStatus(client as never, { leadId, status: status as never });
  } else if (op === "append_note") {
    const note = typeof input.input?.note === "string" ? input.input.note.trim() : "";
    if (!note) {
      return {
        ok: false,
        providerKey: "crm-supabase",
        errorCategory: "INVALID_INPUT",
        errorMessage: "crm.write append_note requires note",
        usage: unknownCostUsage({ requests: 0 }),
      };
    }
    const existingNotes = typeof owned.notes === "string" ? owned.notes : "";
    await updateLead(client as never, {
      leadId,
      tenantId: input.tenantId,
      notes: existingNotes ? `${existingNotes}\n${note.slice(0, 1000)}` : note.slice(0, 1000),
    });
  } else {
    await updateLead(client as never, {
      leadId,
      tenantId: input.tenantId,
      tags: Array.isArray(input.input?.tags) ? (input.input.tags as string[]).slice(0, 20) : undefined,
      assignedTo: typeof input.input?.assignedTo === "string" ? input.input.assignedTo : undefined,
      contactName: typeof input.input?.contactName === "string" ? input.input.contactName : undefined,
      contactEmail:
        typeof input.input?.contactEmail === "string" ? input.input.contactEmail : undefined,
      nextFollowUpAt:
        typeof input.input?.nextFollowUpAt === "string" ? input.input.nextFollowUpAt : undefined,
    });
  }

  const receipt = buildCapabilityExecutionReceipt({
    capability: "crm.write",
    tenantId: input.tenantId,
    missionId: input.missionId,
    requestId: input.requestId,
    providerKey: "crm-supabase",
    operationClass: getCapabilityOperationClass("crm.write"),
    externalMutation: true,
    externalMutationOccurred: true,
    approvalUsed: true,
    idempotencyKey,
    inputArtifactIds: input.inputArtifactIds,
    outputArtifactIds: [leadId],
    providerExternalId: leadId,
    detail: { kind: "crm_write_receipt", operation: op, idempotentReplay: false },
  });
  return {
    ok: true,
    providerKey: "crm-supabase",
    providerReference: leadId,
    outputArtifactIds: [leadId],
    usage: unknownCostUsage({ requests: 1 }),
    receipt,
  };
}

export function createCrmProvider(): CapabilityProvider {
  return {
    key: "crm-supabase",
    capabilityKeys: ["crm.read", "crm.write"],
    status: "IMPLEMENTED",
    probeReadiness: async () => {
      const client = await resolveCrmClient();
      if (!client) {
        return {
          ready: false,
          status: "NOT_CONFIGURED",
          reasonCode: "PROVIDER_NOT_CONFIGURED",
          details: "CRM service client not configured",
        };
      }
      return {
        ready: true,
        status: "IMPLEMENTED",
        reasonCode: "READY",
        details: "leads-and-crm repository path",
      };
    },
    execute: async (input): Promise<ProviderExecuteResult> => {
      const client = await resolveCrmClient();
      if (!client) {
        return {
          ok: false,
          providerKey: "crm-supabase",
          errorCategory: "AUTH_CONFIGURATION",
          errorMessage: "CRM service client not configured",
          usage: unknownCostUsage({ requests: 0 }),
        };
      }
      try {
        if (input.capability === "crm.read") return await executeCrmRead(client, input);
        if (input.capability === "crm.write") return await executeCrmWrite(client, input);
        return {
          ok: false,
          providerKey: "crm-supabase",
          errorCategory: "UNSUPPORTED",
          errorMessage: `unsupported capability ${input.capability}`,
          usage: unknownCostUsage({ requests: 0 }),
        };
      } catch (err) {
        return {
          ok: false,
          providerKey: "crm-supabase",
          errorCategory: "PROVIDER_FAILURE",
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
          usage: unknownCostUsage({ requests: 0 }),
        };
      }
    },
  };
}
