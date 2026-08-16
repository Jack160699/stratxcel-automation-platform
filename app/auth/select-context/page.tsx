import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAvailableAccountContexts } from "@/lib/identity/account-context.ts";
import { ContextSelectionForm } from "./ContextSelectionForm";

export const metadata: Metadata = {
  title: "Select Account Context — Stratxcel",
  robots: { index: false, follow: false },
};

export default async function SelectContextPage() {
  const contextInfo = await getAvailableAccountContexts();

  if (!contextInfo) {
    redirect("/login");
  }

  // If user only has User context, bypass selector directly to /app
  if (!contextInfo.isStaff || contextInfo.contexts.length <= 1) {
    redirect("/app");
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-sx-bg px-4 py-12">
      {/* Subtle background glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_center,rgba(59,130,246,0.08),transparent_50%)]"
        aria-hidden="true"
      />

      <div className="relative w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-sx-border-strong bg-sx-surface-2 shadow-sm">
            <span className="text-xl">⚡</span>
          </div>
          <h1 className="font-sx-sans text-2xl font-bold tracking-tight text-sx-text sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 font-sx-sans text-sm text-sx-text-muted">
            Choose where you want to continue for this session.
          </p>
          {contextInfo.email && (
            <p className="mt-1 font-sx-sans text-xs text-sx-text-subtle">
              Signed in as <span className="font-medium text-sx-text">{contextInfo.email}</span>
            </p>
          )}
        </div>

        {/* Selection Cards Form */}
        <ContextSelectionForm initialActiveContext={contextInfo.activeContext} />

        {/* Safe footer */}
        <p className="mt-8 text-center font-sx-sans text-xs text-sx-text-subtle">
          You can switch between User and Admin contexts anytime from the account menu.
        </p>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
