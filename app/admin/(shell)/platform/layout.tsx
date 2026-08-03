import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireOwnerContext } from "@/lib/social/db-context";
import AdminLogin from "@/app/admin/AdminLogin";

export const metadata: Metadata = {
  title: "Platform Admin — Stratxcel Admin",
  robots: { index: false, follow: false },
};

/**
 * Defense-in-depth re-guard for the /admin/platform subtree — the parent
 * app/admin/(shell)/layout.tsx already gates on requireOwnerContext(), but
 * every nested layout in this build re-checks independently (see
 * app/admin/social/layout.tsx's same pattern) rather than relying solely
 * on an ancestor. Navigation/chrome now lives once in the shared AppShell;
 * this layout only needs to guard and pass children through.
 */
export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOwnerContext();

  if (!ctx.ok) {
    if (ctx.status === 401) return <AdminLogin />;
    return (
      <main className="flex min-h-screen items-center justify-center bg-sx-bg px-4">
        <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-7 text-center">
          <h1 className="font-sx-sans text-xl font-semibold text-sx-text">No access</h1>
          <p className="mt-2 text-sm text-sx-text-muted">Not authorised for Platform Admin.</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
