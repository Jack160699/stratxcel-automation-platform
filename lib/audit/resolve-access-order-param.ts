/**
 * Canonical query param for /audit/access is `order`.
 * `auditOrderId` is accepted temporarily for backward compatibility.
 */
export function resolveAccessOrderParam(params: {
  order?: string;
  auditOrderId?: string;
}): string | undefined {
  const order = params.order?.trim();
  if (order) return order;
  const legacy = params.auditOrderId?.trim();
  return legacy || undefined;
}
