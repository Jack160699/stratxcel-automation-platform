/**
 * Real persistence for Agent Factory agent definitions (agent_definitions
 * table, supabase/migrations/20260902530000_agent_definitions.sql). Pure
 * repository functions -- validation (subset-of-caller's-own-permissions
 * enforcement) lives in agent-factory-tools.ts, not here, matching this
 * session's established split (e.g. business-growth-input.ts stays pure
 * assembly, growth-plan-commit-tool.ts owns the write-path validation).
 */

export interface AgentDefinitionRow {
  id: string;
  key: string;
  name: string;
  description: string;
  department: string | null;
  allowed_tool_names: string[];
  status: "active" | "disabled";
  created_by: string | null;
  created_by_principal_kind: string | null;
  created_at: string;
  updated_at: string;
}

type MinimalSupabase = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): Promise<{ data: AgentDefinitionRow | null; error: { message: string } | null }> };
      order(column: string, opts: { ascending: boolean }): Promise<{ data: AgentDefinitionRow[] | null; error: { message: string } | null }>;
    };
    insert(row: Record<string, unknown>): { select(columns: string): { single(): Promise<{ data: AgentDefinitionRow; error: { message: string } | null }> } };
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): {
        select(columns: string): { single(): Promise<{ data: AgentDefinitionRow; error: { message: string } | null }> };
      };
    };
  };
};

export async function getAgentDefinition(supabase: unknown, key: string): Promise<AgentDefinitionRow | null> {
  const client = supabase as MinimalSupabase;
  const { data, error } = await client.from("agent_definitions").select("*").eq("key", key).maybeSingle();
  if (error) throw new Error(`AGENT_DEFINITION_LOOKUP_FAILED: ${error.message}`);
  return data;
}

export async function listAgentDefinitions(supabase: unknown): Promise<AgentDefinitionRow[]> {
  const client = supabase as MinimalSupabase;
  const { data, error } = await client.from("agent_definitions").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`AGENT_DEFINITION_LIST_FAILED: ${error.message}`);
  return data ?? [];
}

export interface CreateAgentDefinitionInput {
  key: string;
  name: string;
  description: string;
  department: string | null;
  allowedToolNames: string[];
  createdBy: string;
  createdByPrincipalKind: string;
}

export async function createAgentDefinition(supabase: unknown, input: CreateAgentDefinitionInput): Promise<AgentDefinitionRow> {
  const client = supabase as MinimalSupabase;
  const { data, error } = await client
    .from("agent_definitions")
    .insert({
      key: input.key,
      name: input.name,
      description: input.description,
      department: input.department,
      allowed_tool_names: input.allowedToolNames,
      created_by: input.createdBy,
      created_by_principal_kind: input.createdByPrincipalKind,
    })
    .select("*")
    .single();
  if (error) throw new Error(`AGENT_DEFINITION_CREATE_FAILED: ${error.message}`);
  return data;
}

/**
 * The write half of the safety check resolveAgentDispatch (agent-dispatch.ts)
 * already enforces on every dispatch (`definition.status !== "active"` ->
 * refuse) -- that check existed from the start, but nothing could ever
 * actually flip a row to "disabled" until this function, meaning it was
 * real but structurally unreachable. Closes it for real, not just at the
 * type level (AgentDefinitionRow.status has always allowed "disabled").
 */
export async function setAgentDefinitionStatus(
  supabase: unknown,
  key: string,
  status: "active" | "disabled"
): Promise<AgentDefinitionRow | null> {
  const client = supabase as MinimalSupabase;
  const { data, error } = await client
    .from("agent_definitions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("key", key)
    .select("*")
    .single();
  if (error) {
    // A single() update against a key that doesn't exist is a real "not
    // found" case, not a genuine failure -- surfaced to the caller as null
    // rather than a thrown error, matching getAgentDefinition's own
    // not-found-is-not-an-error convention.
    if (/no rows|not found|pgrst116/i.test(error.message)) return null;
    throw new Error(`AGENT_DEFINITION_STATUS_UPDATE_FAILED: ${error.message}`);
  }
  return data;
}
