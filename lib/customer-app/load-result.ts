export type CustomerLoadResult<T> =
  | { status: "success"; data: T }
  | { status: "error"; message: string };

const INFRASTRUCTURE_ERROR_PATTERNS = [
  /staff workspace context/i,
  /service role/i,
  /row-level security/i,
  /tenant_members/i,
  /not a member of this tenant/i,
];

export function customerSafeError(detail: unknown, fallback: string): string {
  if (typeof detail !== "string" || !detail.trim()) return fallback;
  if (INFRASTRUCTURE_ERROR_PATTERNS.some((pattern) => pattern.test(detail))) return fallback;
  return detail;
}

/**
 * Executes one customer-facing JSON request and always resolves to a terminal
 * success or error state. Callers never have to leave a nullable value in a
 * permanent loading state after a rejected request or invalid response.
 */
export async function loadCustomerJson<T>(
  request: () => Promise<Response>,
  fallback: string
): Promise<CustomerLoadResult<T>> {
  try {
    const response = await request();
    const body = (await response.json().catch(() => ({}))) as T & { error?: unknown };
    if (!response.ok) {
      return { status: "error", message: customerSafeError(body.error, fallback) };
    }
    return { status: "success", data: body };
  } catch {
    return { status: "error", message: fallback };
  }
}
