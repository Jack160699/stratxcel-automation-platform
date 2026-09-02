import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { SearchCommandPill } from "@/components/shell/SearchCommandPill";

/** The 56px top command bar shared by /app and /admin — docs/product-design/SHARED_SHELL_SPECIFICATION.md §3. */
export function TopCommandBar({
  brand,
  context,
  agentStatus,
  staffBadge,
  userMenu,
  showSearch = true,
  searchHref = "/admin/copilot",
  customer = false,
}: {
  brand?: ReactNode;
  context: ReactNode;
  agentStatus?: ReactNode;
  staffBadge?: ReactNode;
  userMenu?: ReactNode;
  showSearch?: boolean;
  /** Where the Search/⌘K pill opens — the real Copilot chat that can actually answer it. Defaults to /admin/copilot (this pill currently only ever renders for the admin shell). */
  searchHref?: string;
  /** Customer app (product === "App") visual mode — spec §5.5: taller bar, a Help affordance, more breathing room. /admin never sets this. */
  customer?: boolean;
}) {
  if (customer) {
    return (
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-sx-border px-4 sm:h-16 sm:px-6">
        {brand && <div className="shrink-0 md:hidden">{brand}</div>}
        <div className="min-w-0 truncate text-[17px] font-semibold text-sx-text">{context}</div>
        <div className="flex-1" />
        <a
          href="/contact"
          className="hidden items-center gap-1.5 rounded-sx-sm px-3 py-2 text-sm font-semibold text-sx-text-muted transition-colors hover:bg-sx-surface-2 sm:inline-flex"
        >
          <HelpCircle size={18} strokeWidth={1.75} />
          Help
        </a>
        {agentStatus}
        {staffBadge}
        {userMenu}
      </header>
    );
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3.5 border-b border-sx-border px-5">
      {brand && <div className="shrink-0 md:hidden">{brand}</div>}
      <div className="min-w-0 truncate text-[13.5px] font-semibold text-sx-text">{context}</div>
      {showSearch && <SearchCommandPill href={searchHref} />}
      <div className="flex-1" />
      {agentStatus}
      {staffBadge}
      {userMenu}
    </header>
  );
}

/** "Viewing as Stratxcel staff" indicator — docs/product-design/ROLE_AND_PERMISSION_EXPERIENCE.md §6. Always visible, never tucked into a menu. */
export function StaffContextBadge({ onExit }: { onExit: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sx-pill border border-[rgb(58_160_255_/_0.3)] bg-sx-accent-muted px-2.5 py-1 font-sx-mono text-[10px] uppercase tracking-[0.06em] text-[#6BBBFF]">
      Viewing as Stratxcel staff
      <button onClick={onExit} className="underline underline-offset-2">
        Return to /admin
      </button>
    </span>
  );
}

export function Avatar({ className = "" }: { className?: string }) {
  return <div className={`h-[26px] w-[26px] shrink-0 rounded-full bg-gradient-to-br from-sx-royal to-sx-ai ${className}`} />;
}
