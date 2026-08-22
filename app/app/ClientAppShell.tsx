"use client";

import { usePathname } from "next/navigation";
import { returnToAdminAction } from "./staff-workspace-actions";
import { CoreAppShell } from "@/components/shell/CoreAppShell";
import { APP_SIDEBAR_GROUPS, APP_MOBILE_NAV, resolveAppActiveKey } from "@/components/shell/navigation/app-navigation";
import { APP_MOBILE_NAV_KEYS } from "@/components/shell/navigation/app-nav-data";
import { ClientTenantSwitcher } from "./ClientTenantSwitcher";
import type { CustomerPlanSummary } from "@/lib/billing/customer-plan";
import { CustomerHeaderActions } from "./components/CustomerHeaderActions";

/**
 * /app's own shell — canonical customer information architecture.
 * Primary Navigation: Home | Audit | Content | Growth | More.
 *
 * Growth Assistant (/app/social/copilot) is a dedicated full-screen work mode
 * with its own fixed header, scrollable conversation, and fixed composer.
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
  notifications,
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
  businessName: string;
  role: string | null;
  googleConnected: boolean;
  whatsappConnected: boolean;
  notifications: { key: string; title: string; detail: string; href: string; tone: "warning" | "accent" }[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeKey = resolveAppActiveKey(pathname);
  const isFullScreenCreationMode =
    pathname === "/app/social/copilot" ||
    pathname.startsWith("/app/social/copilot") ||
    pathname === "/app/website/create" ||
    pathname.startsWith("/app/website/create");

  if (isFullScreenCreationMode) {
    return (
      <div className="h-[100dvh] w-full overflow-hidden bg-sx-bg text-sx-text sx-customer-app">
        {staffWorkspace && (
          <div className="flex items-center justify-between gap-3 border-b border-sx-accent/40 bg-sx-accent/10 px-4 py-2 text-xs" role="status">
            <p className="font-medium text-sx-text">Viewing as Stratxcel staff · {staffWorkspace.tenantName}</p>
            <form action={returnToAdminAction}>
              <button type="submit" className="rounded-sx-xs border border-sx-border-strong bg-sx-surface-2 px-2 py-1 text-xs font-semibold text-sx-text hover:bg-sx-elevated">
                Return to Admin
              </button>
            </form>
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <CoreAppShell
      product="App"
      sidebarGroups={APP_SIDEBAR_GROUPS}
      activeKey={activeKey}
      mobileNavItems={APP_MOBILE_NAV}
      mobileMoreGroups={APP_SIDEBAR_GROUPS.map((g) => ({
        label: g.label ?? "Overview",
        items: g.items
          .filter((i) => !(APP_MOBILE_NAV_KEYS as readonly string[]).includes(i.key))
          .map((i) => ({ key: i.key, label: i.label, href: i.href, icon: i.icon })),
      })).filter((g) => g.items.length > 0)}
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
          notifications={notifications}
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
