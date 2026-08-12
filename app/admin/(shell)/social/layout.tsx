import type { Metadata } from "next";
import Link from "next/link";
import "./social-components.css";

export const metadata: Metadata = {
  title: "Social Operations — Stratxcel Admin",
  robots: { index: false, follow: false },
};

const SOCIAL_TABS = [
  ["Overview", "/admin/social"],
  ["Create", "/admin/social/create"],
  ["Planner", "/admin/social/planner"],
  ["Inbox", "/admin/social/inbox"],
  ["Analytics", "/admin/social/analytics"],
  ["Automations", "/admin/social/automations"],
  ["Packages", "/admin/social/packages"],
  ["Social Brand", "/admin/social/brand"],
  ["Connections", "/admin/social/integrations"],
  ["System", "/admin/social/system"],
] as const;

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="social-operations min-w-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-sx-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sx-text-subtle">Social Operations</p>
          <p className="mt-1 text-xs text-sx-text-muted">Publishing, engagement, and channel operations inside the Admin workspace.</p>
        </div>
        <Link href="/admin/copilot?context=social" className="rounded-sx-sm bg-sx-accent px-3 py-2 text-xs font-semibold text-sx-accent-on hover:bg-sx-accent-hover">
          Ask Copilot about Social
        </Link>
      </div>
      <nav aria-label="Social Operations sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-sx-border pb-2">
        {SOCIAL_TABS.map(([label, href]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-sx-sm px-2.5 py-2 text-xs font-medium text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </section>
  );
}
