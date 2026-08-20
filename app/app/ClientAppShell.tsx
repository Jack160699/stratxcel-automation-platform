"use client";

import { usePathname } from "next/navigation";
import { returnToAdminAction } from "./staff-workspace-actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { APP_SIDEBAR_GROUPS, APP_MOBILE_NAV, resolveAppActiveKey } from "@/components/shell/navigation/app-navigation";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";
import type { CustomerPlanSummary } from "@/lib/billing/customer-plan";
import { CustomerHeaderActions } from "./components/CustomerHeaderActions";

/**
 * /app's own shell — the client/workspace product's information
 * architecture (components/shell/navigation/app-navigation.tsx), visually
 * built from the same shared CoreAppShell/Sidebar components /admin uses,
 * but a deliberately separate destination list — see app-navigation.tsx's
 * header comment. /app never renders agency-only destinations (Clients,
 * Operations Queue, System Health, Audit Log, internal Human Handoffs);
 * those exist only in /admin.
 */
export function ClientAppShell({
  tenantId,
  email,
  name,
  plan,
  showPlanPrompt,
  auditOpportunityCount,
  staffWorkspace,
  isStaff = false,
  businessName,
  role,
  googleConnected,
  whatsappConnected,
  children,
}: {
  tenantId: string;
  email: string;
  name: string | null;
  plan: CustomerPlanSummary;
  showPlanPrompt: boolean;
  auditOpportunityCount: number | null;
  staffWorkspace: { tenantName: string } | null;
  isStaff?: boolean;
  /** Tenant/business name — StratXcel Desktop canvas sidebar business card. */
  businessName: string;
  role: string | null;
  googleConnected: boolean;
  whatsappConnected: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeKey = resolveAppActiveKey(pathname);

  return (
    <CoreAppShell
      product="App"
      sidebarGroups={APP_SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={APP_MOBILE_NAV}
      mobileMoreGroups={APP_SIDEBAR_GROUPS.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items.map((i) => ({ key: i.key, label: i.label, href: i.href, icon: i.icon })),
      }))}
      topBarContext={<ClientTenantSwitcher />}
      sidebarBusinessCard={
        <SidebarBusinessCard
          businessName={businessName}
          googleConnected={googleConnected}
          whatsappConnected={whatsappConnected}
        />
      }
      sidebarFooter={<SidebarUserFooter name={name} email={email} role={role} />}
      userMenu={
        <CustomerHeaderActions
          tenantId={tenantId}
          email={email}
          name={name}
          plan={plan}
          showPlanPrompt={showPlanPrompt}
          auditOpportunityCount={auditOpportunityCount}
          isStaff={isStaff}
        />
      }
    >
      {staffWorkspace && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sx-md border border-sx-accent/40 bg-sx-accent/10 px-4 py-3" role="status">
          <p className="text-sm font-medium text-sx-text">Viewing as Stratxcel staff · {staffWorkspace.tenantName}</p>
          <form action={returnToAdminAction}>
            <button type="submit" className="rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 py-2 text-xs font-semibold text-sx-text hover:bg-sx-elevated">
              Return to Admin
            </button>
          </form>
        </div>
      )}
      {children}
    </CoreAppShell>
  );
}

/**
 * Business-identity card under the brand mark — StratXcel Desktop canvas.
 * Connection state comes from the same canonical connector resolver
 * Home/Audit already read (lib/connectors/canonical-status.ts via
 * app/app/layout.tsx), never re-derived here.
 */
function SidebarBusinessCard({
  businessName,
  googleConnected,
  whatsappConnected,
}: {
  businessName: string;
  googleConnected: boolean;
  whatsappConnected: boolean;
}) {
  const liveParts = [googleConnected && "Google", whatsappConnected && "WhatsApp"].filter(Boolean) as string[];
  return (
    <div className="mx-1 mb-3 rounded-sx-sm bg-sx-surface-2 p-3">
      <p className="truncate text-[14px] font-bold text-sx-text">{businessName}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${liveParts.length > 0 ? "bg-sx-success" : "bg-sx-text-subtle"}`} />
        <span className="truncate text-[11px] font-medium text-sx-success">
          {liveParts.length > 0 ? `Live on ${liveParts.join(" & ")}` : "Not live yet"}
        </span>
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  operator: "Team member",
  viewer: "Viewer",
};

/** User identity footer at the bottom of the sidebar — StratXcel Desktop canvas. The real account menu (profile, billing, sign out) stays in the top bar via CustomerHeaderActions; this is identity display only. */
function SidebarUserFooter({ name, email, role }: { name: string | null; email: string; role: string | null }) {
  const initials = (name?.trim() || email.split("@")[0] || "S")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-2.5 border-t border-sx-border px-1 pt-3">
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-sx-surface-3 text-[13px] font-bold text-sx-text-muted">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-sx-text">{name || email}</p>
        <p className="truncate text-[11px] text-sx-text-subtle">{(role && ROLE_LABELS[role]) || "Team member"}</p>
      </div>
    </div>
  );
}
