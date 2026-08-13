import type { ReactNode } from "react";
import { PublicFooter } from "@/app/components/PublicFooter";
import { PublicHeader } from "@/app/components/PublicHeader";

type PublicPageShellProps = {
  children: ReactNode;
  beforeMain?: ReactNode;
  className?: string;
};

export function PublicPageShell({ children, beforeMain, className = "" }: PublicPageShellProps) {
  return (
    <div
      className={`sx-public-theme flex min-h-screen flex-col overflow-x-hidden bg-sx-bg font-sx-sans text-sx-text antialiased ${className}`.trim()}
    >
      <PublicHeader logoVariant="light" />
      {beforeMain}
      <main className="flex-1">{children}</main>
      <PublicFooter logoVariant="light" />
    </div>
  );
}
