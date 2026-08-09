import type { AgentTool, ToolRisk } from "../tools/contract.ts";

export interface CapabilityGroup { name: string; risk: ToolRisk; examples: string[] }

const GROUP_RULES: Array<[RegExp, string]> = [
  [/lead|conversation|follow_up|appointment/, "Leads & conversations"],
  [/client|agency|workspace/, "Clients & agency"],
  [/mission/, "Missions"], [/approval/, "Approvals"], [/handoff/, "Human handoffs"],
  [/social/, "Social operations"], [/finance|wallet/, "Finance"], [/audit/, "Audit"],
  [/health|queue/, "Platform health & operations"], [/integration/, "Integrations"],
  [/brand/, "Brand knowledge"], [/memory/, "Memory"], [/artifact|report/, "Files & reports"],
];

export function capabilityGroupsFromTools(tools: readonly AgentTool[]): CapabilityGroup[] {
  const groups = new Map<string, CapabilityGroup>();
  for (const tool of tools) {
    const name = GROUP_RULES.find(([pattern]) => pattern.test(tool.schema.name))?.[1] ?? "General operations";
    const existing = groups.get(name) ?? { name, risk: tool.risk, examples: [] };
    if (riskRank(tool.risk) > riskRank(existing.risk)) existing.risk = tool.risk;
    if (existing.examples.length < 2) existing.examples.push(tool.schema.description);
    groups.set(name, existing);
  }
  return [...groups.values()];
}

function riskRank(risk: ToolRisk): number { return { read: 0, low_mutation: 1, external_mutation: 2, high_risk: 3 }[risk]; }
