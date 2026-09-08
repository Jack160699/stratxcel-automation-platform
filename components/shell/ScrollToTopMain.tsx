"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * PAGE NAVIGATION BUG FIX (Final Customer Experience Repair, Section 6):
 * the shared shell's own <main> (CoreAppShell.tsx) is the REAL scroll
 * container -- it's `overflow-y-auto`, not the browser window/document --
 * so Next.js's built-in scroll restoration (which only ever targets
 * window/document) never reset it on navigation. Real reported bug: the
 * next page (a new onboarding step, an audit/results screen) could open
 * with the PREVIOUS page's scroll position still applied, its own
 * header/title scrolled out of view.
 *
 * Resets this element to the top on every real route change (pathname).
 * Onboarding's OWN step transitions don't change the URL at all (a single
 * route, client-state-driven step) -- OnboardingWizard resets this same
 * element directly on step change instead (see its own effect, keyed off
 * `id="sx-shell-scroll-main"` below), not covered by this alone.
 */
export function ScrollToTopMain({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <main ref={ref} id="sx-shell-scroll-main" className={className}>
      {children}
    </main>
  );
}
