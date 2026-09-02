"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The top-bar "Search ⌘K" pill -- previously a plain <button> with no
 * onClick at all (found live 2026-09-02, master brief section 20: "no
 * hardcoded fake actions" / section 15: "remove fake/empty metrics" --
 * a visible, always-rendered control that did literally nothing when
 * clicked, in both /admin's own top bar). Real command/query destinations
 * (check SEO, show revenue, analyze a client, etc.) already exist as real
 * agent tools reachable through Admin Copilot (runAgentTurn/
 * resolveAgentTools) -- this pill now genuinely opens that real interface,
 * both on click and on the Cmd/Ctrl+K shortcut its own label promises,
 * rather than pointing to a second, fake command palette that would just
 * duplicate what Copilot already does for real.
 */
export function SearchCommandPill({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isCmdK) return;
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing) return;
      e.preventDefault();
      router.push(href);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, href]);

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      className="hidden h-7 items-center gap-1.5 rounded-sx-xs border border-sx-border-strong bg-sx-surface-2 px-2.5 text-xs text-sx-text-subtle transition-colors hover:border-sx-border-strong hover:text-sx-text sm:inline-flex"
    >
      Search
      <span className="ml-1.5 rounded-[4px] border border-sx-border-strong px-1 font-sx-mono text-[9px]">⌘K</span>
    </button>
  );
}
