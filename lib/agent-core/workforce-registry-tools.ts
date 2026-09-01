/**
 * Bridges a real, mature, already-tested engine that the original capability
 * audit (Update 11) missed entirely: packages/workforce-core's own
 * departments/roles/capabilities registries (~1,200 lines, real TypeScript
 * types, real registry.test.ts coverage) -- the actual org-chart and
 * implementation-status model Hermes's mission engine is built on. 25 real
 * departments, each with specialist roles, accepted/output artifact
 * classes, quality gates, and risk level; ~29 real capability keys each
 * with an explicit, never-defaulted AVAILABLE/PLANNED/NOT_CONFIGURED/
 * UNAVAILABLE implementation status.
 *
 * This is NOT a duplicate of check_capabilities (packages/agent-core's
 * Postgres capability_registry, Update 11) -- the two track different
 * axes for different consumers:
 *   - check_capabilities: "can a human ask the WhatsApp/Admin agent to do
 *     X right now" (tool-exposure status).
 *   - check_workforce_registry (this tool): "does Hermes's own mission
 *     engine model X as an implemented, executable capability at all"
 *     (internal engine implementation status) -- true independent of
 *     whether anything here is WhatsApp-reachable, and true independent
 *     of hermesMode (production currently reports hermesMode: disabled,
 *     so even an AVAILABLE capability here does not currently execute
 *     autonomously -- this tool reports the real model, not a claim that
 *     missions are running).
 *
 * Static, in-memory, zero-cost, zero-risk: listDepartments()/
 * listAllRoles()/listCapabilities()/countCapabilitiesByStatus() read
 * nothing from a database or network, so this tool can never be stale
 * relative to the deployed code and never fails.
 */
import { listDepartments, listAllRoles, listCapabilities, countCapabilitiesByStatus } from "@stratxcel/workforce-core";
import type { AgentTool } from "@stratxcel/agent-core";

export const WORKFORCE_REGISTRY_TOOLS: AgentTool[] = [
  {
    schema: {
      name: "check_workforce_registry",
      description: "The real departments, specialist roles, and Hermes mission-engine capability implementation statuses (AVAILABLE/PLANNED/NOT_CONFIGURED/UNAVAILABLE) modeled in the codebase -- a static, always-accurate org chart and build-status catalog, distinct from check_capabilities (which tracks WhatsApp/Admin-agent tool exposure, not the mission engine's internal model). Use for 'what departments/roles does our AI workforce have', 'what can the autonomous engine actually execute yet'. Note: AVAILABLE here describes the implementation, not live autonomous execution -- missions do not currently run unattended (see check_capabilities' hermes_missions row).",
      parameters: {
        type: "object",
        properties: {
          department: { type: "string", description: "Optional -- a specific department key (e.g. 'seo', 'crm', 'website') to see just its roles and mission. Omit for the full summary." },
        },
      },
    },
    mutating: false,
    risk: "read",
    requiredPermission: "agent:read:capabilities",
    async execute(_ctx, args) {
      const departments = listDepartments();
      const departmentKey = typeof args.department === "string" ? args.department : null;

      if (departmentKey) {
        const match = departments.find((d) => d.key === departmentKey);
        if (!match) return { found: false, reason: "unknown_department", knownDepartments: departments.map((d) => d.key) };
        return {
          found: true,
          department: {
            key: match.key,
            label: match.label,
            mission: match.mission,
            riskLevel: match.riskLevel,
            releaseClassification: match.releaseClassification,
            specialistRoles: match.specialistRoles,
            requestableCapabilityClasses: match.requestableCapabilityClasses,
          },
        };
      }

      const capabilities = listCapabilities();
      return {
        departmentCount: departments.length,
        roleCount: listAllRoles().length,
        capabilityCountsByStatus: countCapabilitiesByStatus(),
        departments: departments.map((d) => ({ key: d.key, label: d.label, riskLevel: d.riskLevel, releaseClassification: d.releaseClassification, roleCount: d.specialistRoles.length })),
        capabilities: capabilities.map((c) => ({ key: c.key, label: c.label, status: c.status, riskLevel: c.riskLevel, externalMutation: c.externalMutation, approvalRequired: c.approvalRequired })),
      };
    },
  },
];
