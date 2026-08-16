"use client";

import { useState, useTransition } from "react";
import { selectContextAction } from "@/app/actions/context.ts";
import type { AccountContext } from "@/lib/identity/account-context.ts";

export function ContextSelectionForm({
  initialActiveContext,
}: {
  initialActiveContext: AccountContext;
}) {
  const [selectedContext, setSelectedContext] = useState<AccountContext>(initialActiveContext);
  const [isPending, startTransition] = useTransition();

  function handleSelect(context: AccountContext) {
    setSelectedContext(context);
    startTransition(async () => {
      await selectContextAction(context);
    });
  }

  return (
    <div className="space-y-4" role="radiogroup" aria-label="Select account context">
      {/* Option 1: User / Business Context */}
      <button
        type="button"
        role="radio"
        aria-checked={selectedContext === "user"}
        disabled={isPending}
        onClick={() => handleSelect("user")}
        className={`group relative flex w-full flex-col text-left rounded-sx-lg border p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent disabled:opacity-60 ${
          selectedContext === "user"
            ? "border-sx-accent bg-sx-accent/[0.06] shadow-sm ring-1 ring-sx-accent/30"
            : "border-sx-border bg-sx-surface-1 hover:border-sx-border-strong hover:bg-sx-surface-2"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-sx-md border text-lg transition-colors ${
                selectedContext === "user"
                  ? "border-sx-accent/40 bg-sx-accent/15 text-sx-accent"
                  : "border-sx-border bg-sx-surface-2 text-sx-text-muted group-hover:text-sx-text"
              }`}
            >
              👤
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-sx-sans text-base font-bold text-sx-text">
                  User Workspace
                </h2>
                <span className="rounded-full border border-sx-border px-2 py-0.5 font-sx-sans text-[10px] font-semibold uppercase tracking-wider text-sx-text-muted">
                  Business
                </span>
              </div>
              <p className="mt-0.5 font-sx-sans text-xs text-sx-text-muted">
                Use StratXcel as a business or customer
              </p>
            </div>
          </div>

          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
              selectedContext === "user"
                ? "border-sx-accent bg-sx-accent text-white"
                : "border-sx-border-strong bg-sx-surface-3"
            }`}
          >
            {selectedContext === "user" && (
              <span className="h-2 w-2 rounded-full bg-white" />
            )}
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 border-t border-sx-border/60 pt-3 text-[11px] text-sx-text-muted">
          <li className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Onboarding, Google Business & social connectors
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Autopilot, CRM, Missions, and Brand Brain
          </li>
        </ul>

        <div className="mt-4 flex items-center justify-end">
          <span
            className={`inline-flex items-center gap-1 font-sx-sans text-xs font-semibold ${
              selectedContext === "user"
                ? "text-sx-accent"
                : "text-sx-text-muted group-hover:text-sx-text"
            }`}
          >
            {isPending && selectedContext === "user" ? "Entering…" : "Enter User Workspace →"}
          </span>
        </div>
      </button>

      {/* Option 2: Admin Command Center Context */}
      <button
        type="button"
        role="radio"
        aria-checked={selectedContext === "admin"}
        disabled={isPending}
        onClick={() => handleSelect("admin")}
        className={`group relative flex w-full flex-col text-left rounded-sx-lg border p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent disabled:opacity-60 ${
          selectedContext === "admin"
            ? "border-sx-accent bg-sx-accent/[0.06] shadow-sm ring-1 ring-sx-accent/30"
            : "border-sx-border bg-sx-surface-1 hover:border-sx-border-strong hover:bg-sx-surface-2"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-sx-md border text-lg transition-colors ${
                selectedContext === "admin"
                  ? "border-sx-accent/40 bg-sx-accent/15 text-sx-accent"
                  : "border-sx-border bg-sx-surface-2 text-sx-text-muted group-hover:text-sx-text"
              }`}
            >
              🛡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-sx-sans text-base font-bold text-sx-text">
                  Admin Command Center
                </h2>
                <span className="rounded-full border border-sx-accent/30 bg-sx-accent/10 px-2 py-0.5 font-sx-sans text-[10px] font-semibold uppercase tracking-wider text-sx-accent">
                  Staff
                </span>
              </div>
              <p className="mt-0.5 font-sx-sans text-xs text-sx-text-muted">
                Manage StratXcel platform, operations & clients
              </p>
            </div>
          </div>

          <div
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
              selectedContext === "admin"
                ? "border-sx-accent bg-sx-accent text-white"
                : "border-sx-border-strong bg-sx-surface-3"
            }`}
          >
            {selectedContext === "admin" && (
              <span className="h-2 w-2 rounded-full bg-white" />
            )}
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 border-t border-sx-border/60 pt-3 text-[11px] text-sx-text-muted">
          <li className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> Client management & staff support handoffs
          </li>
          <li className="flex items-center gap-1.5">
            <span className="text-emerald-400">✓</span> System telemetry, queues & finance reconciliation
          </li>
        </ul>

        <div className="mt-4 flex items-center justify-end">
          <span
            className={`inline-flex items-center gap-1 font-sx-sans text-xs font-semibold ${
              selectedContext === "admin"
                ? "text-sx-accent"
                : "text-sx-text-muted group-hover:text-sx-text"
            }`}
          >
            {isPending && selectedContext === "admin" ? "Entering…" : "Enter Admin Command Center →"}
          </span>
        </div>
      </button>
    </div>
  );
}
