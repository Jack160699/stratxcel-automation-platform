/** Strict tenant isolation — no owner-global fallback. */
export function assertSameTenant(actorTenantId: string, resourceTenantId: string, action: string): void {
  if (!actorTenantId || !resourceTenantId) {
    throw new Error(`tenant_required:${action}`);
  }
  if (actorTenantId !== resourceTenantId) {
    throw new Error(`cross_tenant_rejected:${action}`);
  }
}

export function assertConversationTenant(input: {
  tenantId: string;
  conversationTenantId: string;
  leadTenantId?: string | null;
}): void {
  assertSameTenant(input.tenantId, input.conversationTenantId, "conversation");
  if (input.leadTenantId) {
    assertSameTenant(input.tenantId, input.leadTenantId, "lead");
  }
}

export function filterLeadsForTenant<T extends { tenant_id: string }>(tenantId: string, leads: readonly T[]): T[] {
  return leads.filter((l) => l.tenant_id === tenantId);
}
