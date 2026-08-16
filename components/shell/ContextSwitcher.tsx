"use client";

import { useTransition } from "react";
import { switchContextAction } from "@/app/actions/context.ts";
import type { AccountContext } from "@/lib/identity/account-context.ts";

interface ContextSwitcherProps {
  currentContext: AccountContext;
  compact?: boolean;
}

export function ContextSwitcher({ currentContext, compact = false }: ContextSwitcherProps) {
  const [isPending, startTransition] = useTransition();

  const targetContext: AccountContext = currentContext === "admin" ? "user" : "admin";
  const targetLabel = targetContext === "admin" ? "Switch to Admin" : "Switch to User";
  const currentLabel = currentContext === "admin" ? "Admin" : "User";
  const icon = currentContext === "admin" ? "🛡" : "👤";

  function handleSwitch() {
    startTransition(async () => {
      await switchContextAction(targetContext);
    });
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending}
        title={`${targetLabel} (${isPending ? "Switching…" : "Click to switch"})`}
        aria-label={`${targetLabel}`}
        className="flex items-center gap-1.5 rounded-full border border-sx-border bg-sx-surface-2 px-2.5 py-1 text-xs font-semibold text-sx-text-muted transition-colors hover:border-sx-accent/40 hover:bg-sx-accent/10 hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent disabled:opacity-60"
      >
        <span>{icon}</span>
        <span className="hidden sm:inline">{currentLabel}</span>
        <span className="text-[10px] text-sx-accent">⇄</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2.5 py-1 text-xs font-medium text-sx-text">
        <span>{icon}</span>
        <span>{currentLabel}</span>
      </div>
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending}
        className="flex items-center gap-1 rounded-sx-sm border border-sx-border-strong bg-sx-surface-3 px-2.5 py-1 text-xs font-semibold text-sx-accent hover:bg-sx-accent hover:text-sx-accent-on transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-accent disabled:opacity-60 shadow-xs"
      >
        <span>⇄</span>
        <span>{isPending ? "Switching…" : targetLabel}</span>
      </button>
    </div>
  );
}
