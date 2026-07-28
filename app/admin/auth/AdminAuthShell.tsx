import "@/app/admin/social/social-theme.css";
import { Mark } from "@/app/components/Mark";
import { CommandCenterBrandPanel } from "./CommandCenterBrandPanel";

export function AdminAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="saut-root">
      <div className="saut-auth-shell">
        <CommandCenterBrandPanel />
        <div className="saut-auth-panel">
          <div className="saut-auth-card">
            <div className="flex items-center gap-2.5 lg:hidden">
              <Mark className="h-7 w-7" />
              <span className="saut-mono text-[11px] uppercase tracking-[0.3em]" style={{ color: "var(--saut-text-muted)" }}>
                Stratxcel
              </span>
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] lg:mt-0" style={{ color: "var(--saut-text)" }}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1.5 text-sm" style={{ color: "var(--saut-text-subtle)" }}>
                {subtitle}
              </p>
            )}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
