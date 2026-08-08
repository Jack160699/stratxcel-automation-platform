/**
 * Channel-independent agent principal model.
 *
 * This is the single source of truth for "who is talking to the agent and
 * what are they allowed to do", regardless of whether the request came from
 * the admin web app, the client web app, or WhatsApp.
 *
 * SECURITY PRINCIPLE: the LLM never decides authorization. A principal is
 * always resolved server-side, before any tool is exposed, from verified
 * identity (an authenticated session, or a verified+linked WhatsApp phone
 * number). Nothing in the user-supplied prompt text can mint or upgrade a
 * principal — see resolveTools()/resolveAgentTools() in tool-registry.ts,
 * which take an AgentPrincipal, never a prompt string.
 */

import type { TenantRole } from "./types-external.ts";

export type AgentChannel = "admin_web" | "client_web" | "whatsapp";

export type AgentPrincipalKind = "staff" | "client";

/** Staff principal. May have cross-tenant/admin capabilities according to
 *  the existing platform_staff_users policy. tenantId is nullable because
 *  platform staff are not scoped to a single tenant today (see
 *  supabase/migrations/20260806006500_platform_staff_and_audit_completion_hardening.sql). */
export interface StaffAgentPrincipal {
  kind: "staff";
  channel: AgentChannel;
  authUserId: string;
  tenantId: string | null;
  /** Platform staff role, e.g. platform_owner | platform_admin | audit_reviewer | finance_reviewer. */
  role: string;
  permissions: readonly string[];
}

/** Client principal. MUST always have a concrete tenantId — a client
 *  principal with a null tenantId is a programming error and must be
 *  treated as invalid by every call site. */
export interface ClientAgentPrincipal {
  kind: "client";
  channel: AgentChannel;
  authUserId: string;
  tenantId: string;
  /** Tenant membership role (owner | admin | operator | viewer). */
  role: TenantRole;
  permissions: readonly string[];
}

export type AgentPrincipal = StaffAgentPrincipal | ClientAgentPrincipal;

/**
 * Result of resolving "who is this" for a channel. Unknown/unlinked senders
 * (e.g. a WhatsApp number with no whatsapp_channel_principals row) DO NOT
 * receive an AgentPrincipal — they remain in the existing prospect/CRM flow
 * and never reach tool resolution.
 */
export type AgentPrincipalResolution =
  | { status: "resolved"; principal: AgentPrincipal }
  | { status: "unlinked" }
  | { status: "revoked" };

export function isStaffPrincipal(p: AgentPrincipal): p is StaffAgentPrincipal {
  return p.kind === "staff";
}

export function isClientPrincipal(p: AgentPrincipal): p is ClientAgentPrincipal {
  return p.kind === "client";
}

/** Defensive invariant check — call at every trust boundary that accepts an
 *  AgentPrincipal from a layer you don't fully control (e.g. deserialized
 *  from a queue message). Throws rather than silently proceeding. */
export function assertValidPrincipal(p: AgentPrincipal): void {
  if (p.kind === "client" && !p.tenantId) {
    throw new Error("agent-core: invariant violated — client principal without tenantId");
  }
  if (!p.authUserId) {
    throw new Error("agent-core: invariant violated — principal without authUserId");
  }
}
