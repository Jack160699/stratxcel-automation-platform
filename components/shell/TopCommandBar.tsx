import type { ReactNode } from "react";

/** The 56px top command bar shared by /app and /admin — docs/product-design/SHARED_SHELL_SPECIFICATION.md §3. */
export function TopCommandBar({
  brand,
  context,
  agentStatus,
  staffBadge,
  userMenu,
  showSearch = true,
}: {
  brand?: ReactNode;
  context: ReactNode;
  agentStatus?: ReactNode;
  staffBadge?: ReactNode;
  userMenu?: ReactNode;
  showSearch?: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3.5 border-b border-sx-border px-5">
      {brand && <div className="shrink-0 md:hidden">{brand}</div>}
      <div className="min-w-0 truncate text-[13.5px] font-semibold text-sx-text">{context}</div>
      {showSearch && <SearchPill />}
      <div className="flex-1" />
      {agentStatus}
      {staffBadge}
      {userMenu}
    </header>
  );
}

function SearchPill() {
  return (
    <button className="hidden h-7 items-center gap-1.5 rounded-sx-xs border border-sx-border-strong bg-sx-surface-2 px-2.5 text-xs text-sx-text-subtle sm:inline-flex">
      Search
      <span className="ml-1.5 rounded-[4px] border border-sx-border-strong px-1 font-sx-mono text-[9px]">⌘K</span>
    </button>
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
