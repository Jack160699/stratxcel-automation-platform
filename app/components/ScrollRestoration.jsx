"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Disables browser scroll restoration and keeps the document at the top on
 * load, refresh, and client-side navigations (App Router).
 */
export function ScrollRestoration() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { history } = window;
    if (history && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const toTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    };

    toTop();
    const id = window.requestAnimationFrame(toTop);
    const t = window.setTimeout(toTop, 0);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
    };
  }, [pathname]);

  return null;
}
