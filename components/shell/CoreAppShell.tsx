import type { ReactNode } from "react";
import Image from "next/image";
import { Sidebar, type SidebarNavGroup } from "@/components/shell/Sidebar";
import { MobileBottomNav, type BottomNavItem } from "@/components/shell/MobileBottomNav";
import { TopCommandBar } from "@/components/shell/TopCommandBar";
import { OFFICIAL_LOGO } from "@/lib/brand";

export function BrandMark({ expanded = false, product, customer = false }: { expanded?: boolean; product?: string; customer?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/logo-v2.png"
        alt="StratXcel"
        role="presentation"
        width={28}
        height={28}
        priority
        className="h-7 w-7 shrink-0 object-contain"
      />
      {expanded && (
        <span className="flex items-baseline gap-2 truncate">
          <span className="font-sx-sans text-[16px] font-bold tracking-tight text-sx-text">StratXcel</span>
          {product && !customer && (
            <span className="rounded-[5px] border border-[rgb(79_220_229_/_0.24)] bg-[rgb(79_220_229_/_0.1)] px-1.5 py-0.5 font-sx-mono text-[9px] uppercase tracking-[0.08em] text-sx-ai">
              {product}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * Full Core shell — composes Sidebar + TopCommandBar + MobileBottomNav
 * around one page's content. Used identically by /app and /admin, each
 * configured with a different nav item array (the actual "one product, not
 * two shells" mechanism — docs/product-design/SHARED_SHELL_SPECIFICATION.md §2).
 */
export function CoreAppShell({
  product,
  sidebarGroups,
  activeKey,
  topBarContext,
  agentStatus,
  staffBadge,
  userMenu,
  mobileNavItems,
  mobileMoreGroups,
  sidebarBusinessCard,
  sidebarFooter,
  children,
}: {
  product: string;
  sidebarGroups: SidebarNavGroup[];
  activeKey: string;
  topBarContext: ReactNode;
  agentStatus?: ReactNode;
  staffBadge?: ReactNode;
  userMenu?: ReactNode;
  mobileNavItems: BottomNavItem[];
  mobileMoreGroups: { label: string; items: { key: string; label: string; href: string; icon?: ReactNode }[] }[];
  /** Customer-only sidebar business-identity card (StratXcel Desktop canvas). /admin never sets this. */
  sidebarBusinessCard?: ReactNode;
  /** Customer-only sidebar user-identity footer (StratXcel Desktop canvas). /admin never sets this. */
  sidebarFooter?: ReactNode;
  children: ReactNode;
}) {
  const isCustomer = product === "App";
  return (
    <div className={`flex min-h-screen bg-sx-bg text-sx-text ${isCustomer ? "sx-customer-app" : ""}`}>
      <div className="hidden md:block">
        <Sidebar
          groups={sidebarGroups}
          activeKey={activeKey}
          customer={isCustomer}
          brand={(collapsed) => <BrandMark expanded={!collapsed} product={product} customer={isCustomer} />}
          businessCard={sidebarBusinessCard}
          footer={sidebarFooter}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-24 md:pb-0">
        <TopCommandBar
          brand={<BrandMark product={product} customer={isCustomer} />}
          context={topBarContext}
          agentStatus={agentStatus}
          staffBadge={staffBadge}
          userMenu={userMenu}
          showSearch={product !== "App"}
          customer={isCustomer}
        />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 w-full max-w-full">{children}</main>
      </div>
      <MobileBottomNav items={mobileNavItems} activeKey={activeKey} moreGroups={mobileMoreGroups} customer={isCustomer} />
    </div>
  );
}
