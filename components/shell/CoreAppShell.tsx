import type { ReactNode } from "react";
import { Mark } from "@/app/components/Mark";
import { Sidebar, type SidebarNavGroup } from "@/components/shell/Sidebar";
import { MobileBottomNav, type BottomNavItem } from "@/components/shell/MobileBottomNav";
import { TopCommandBar } from "@/components/shell/TopCommandBar";

export function BrandMark({ expanded = false, product }: { expanded?: boolean; product?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark className="h-6 w-6 shrink-0" />
      {expanded && (
        <span className="flex items-baseline gap-2 truncate">
          <span className="font-sx-sans text-[13.5px] font-semibold uppercase tracking-[0.09em] text-sx-text">Stratxcel</span>
          {product && (
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
  mobileMoreGroups: { label: string; items: { key: string; label: string; href: string }[] }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-sx-bg text-sx-text">
      <div className="hidden md:block">
        <Sidebar groups={sidebarGroups} activeKey={activeKey} brand={<BrandMark expanded product={product} />} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col pb-14 md:pb-0">
        <TopCommandBar context={topBarContext} agentStatus={agentStatus} staffBadge={staffBadge} userMenu={userMenu} />
        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
      <MobileBottomNav items={mobileNavItems} activeKey={activeKey} moreGroups={mobileMoreGroups} />
    </div>
  );
}
