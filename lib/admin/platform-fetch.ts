"use client";

import { STAFF_WORKSPACE_CONTEXT_ERROR } from "@/lib/identity/staff-workspace-errors";

function tenantIdFromRequest(input: RequestInfo | URL, init?: RequestInit): string | null {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : null;
  if (!url) return null;

  const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const fromQuery = parsed.searchParams.get("tenantId");
  if (fromQuery) return fromQuery;

  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body) as { tenantId?: string };
      if (body.tenantId) return body.tenantId;
    } catch {
      // ignore non-JSON bodies
    }
  }

  return null;
}

async function tryRecoverStaffWorkspace(tenantId: string): Promise<boolean> {
  const res = await fetch("/api/admin/staff-workspace/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId }),
    cache: "no-store",
  });
  return res.ok;
}

/**
 * Admin platform fetch with one safe workspace-context recovery attempt on 403.
 * Does not loop or weaken tenant isolation.
 */
export async function platformFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 403) return response;

  const body = await response.clone().json().catch(() => null);
  if (body?.error !== STAFF_WORKSPACE_CONTEXT_ERROR) return response;

  const tenantId = tenantIdFromRequest(input, init);
  if (!tenantId) return response;

  const recovered = await tryRecoverStaffWorkspace(tenantId);
  if (!recovered) return response;

  return fetch(input, init);
}
