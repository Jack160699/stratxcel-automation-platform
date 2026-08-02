"use client";

import { useState } from "react";

const STORAGE_KEY = "stratxcel_platform_admin_tenant_id";

function readStoredTenantId(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

/**
 * There is no tenant-switcher UI yet (that's real dashboard work, not
 * built tonight) — every /admin/platform/* page needs a tenantId to call
 * its API route, so this persists whatever the operator last typed in
 * localStorage (client-side only) rather than requiring it in every
 * page's URL by hand. This is explicitly a stopgap, not the final
 * tenant-selection UX. Reads localStorage via a lazy useState initializer
 * (guarded for SSR) rather than an effect, so there's no post-mount
 * hydration flash where the field briefly shows empty before filling in.
 */
export function useTenantId(): [string, (id: string) => void] {
  const [tenantId, setTenantIdState] = useState(readStoredTenantId);

  function setTenantId(id: string) {
    setTenantIdState(id);
    window.localStorage.setItem(STORAGE_KEY, id);
  }

  return [tenantId, setTenantId];
}
