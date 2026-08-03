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
 * Server-resolved membership list + active selection, handed down once by
 * app/admin/(shell)/layout.tsx (which already re-verified both against the
 * database this request) and made available to every "use client" page
 * nested under the shell without each one re-fetching or re-implementing
 * tenant resolution. Switching still round-trips through the server action
 * (which re-verifies membership again) rather than trusting the client-held
 * `tenants` list — this context is UX convenience, not a security boundary.
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
