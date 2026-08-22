import type { ReactNode } from "react";
import Link from "next/link";
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
 * Persistent floating "Ask / पूछें" button — spec §6, §7.7. Never a nav tab;
 * opens the Copilot surface from anywhere in the customer app. Bottom-right,
 * above the mobile bottom nav; bottom-right of content on desktop.
 */
function AskCopilotButton() {
  return (
    <Link
      href="/app/social/copilot"
      className="fixed bottom-24 right-4 z-20 flex h-13 items-center gap-2 rounded-sx-pill bg-sx-accent pl-4 pr-5 text-sx-accent-on shadow-[var(--sx-shadow-xl)] transition-transform active:scale-95 hover:bg-[color:var(--sx-accent-hover)] md:bottom-8 md:right-8"
      style={{ height: 52 }}
      aria-label="Ask StratXcel"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5l1.9 5.6L19.5 11l-5.6 1.9L12 18.5l-1.9-5.6L4.5 11l5.6-1.9z" />
      </svg>
      <span className="flex flex-col items-start leading-none">
        <span className="text-[15px] font-semibold">Ask</span>
        <span className="sx-hi text-[11px] opacity-85">पूछें</span>
      </span>
    </Link>
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
      {isCustomer && <AskCopilotButton />}
    </div>
  );
}
