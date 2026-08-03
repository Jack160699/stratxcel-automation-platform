"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TenantMembership } from "@/lib/tenants/current-tenant";
import { setActiveTenantAction } from "./tenant-actions";

interface CurrentTenantContextValue {
  tenants: TenantMembership[];
  active: TenantMembership | null;
  switching: boolean;
  switchTenant: (tenantId: string) => Promise<void>;
}

const CurrentTenantContext = createContext<CurrentTenantContextValue | null>(null);

/**
 * /app's copy of app/admin/(shell)/CurrentTenantContext.tsx — identical
 * logic (server-resolved membership handed down once, switching
 * round-trips through a server action that re-verifies membership), wired
 * to /app's own tenant-actions.ts since the two shells use different auth
 * gates (requireClientContext vs requireOwnerContext). A shared, prop-driven
 * version is reasonable future cleanup; kept duplicated here to avoid
 * touching the already-tested /admin implementation in this pass.
 */
export function CurrentTenantProvider({
  initialTenants,
  initialActive,
  children,
}: {
  initialTenants: TenantMembership[];
  initialActive: TenantMembership | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [switching, setSwitching] = useState(false);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      const target = initialTenants.find((t) => t.tenantId === tenantId);
      if (!target) return;
      setSwitching(true);
      try {
        const result = await setActiveTenantAction(tenantId);
        if (!result.ok) return;
        setActive(target);
        router.refresh();
      } finally {
        setSwitching(false);
      }
    },
    [initialTenants, router]
  );

  return (
    <CurrentTenantContext.Provider value={{ tenants: initialTenants, active, switching, switchTenant }}>
      {children}
    </CurrentTenantContext.Provider>
  );
}

export function useCurrentTenant(): CurrentTenantContextValue {
  const ctx = useContext(CurrentTenantContext);
  if (!ctx) throw new Error("useCurrentTenant must be used within CurrentTenantProvider");
  return ctx;
}
