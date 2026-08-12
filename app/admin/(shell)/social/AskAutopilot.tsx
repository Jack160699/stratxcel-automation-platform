import Link from "next/link";

const QUICK_ACTIONS = ["Plan next week", "Analyze this month's performance", "Find our biggest opportunity", "Check why anything failed"];

export default function AskAutopilot() {
  return (
    <div className="saut-card-ai p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--saut-text)" }}>Ask Copilot about Social</p>
          <p className="mt-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>Open the canonical Admin Copilot with Social tools and history.</p>
        </div>
        <Link href="/admin/copilot?context=social" className="saut-btn saut-btn-primary">Open Copilot</Link>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((label) => (
          <Link key={label} href={`/admin/copilot?context=social&prompt=${encodeURIComponent(label)}`} className="saut-btn saut-btn-secondary !h-7 !px-2.5 text-[11px]">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
