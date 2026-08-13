"use client";

import { useState } from "react";
import { sanitizeRedirectUrl, parseWorkspaceModeParam } from "./redirect";

export function useNextParam(): string | null {
  const [next] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw) return null;
    return sanitizeRedirectUrl(raw, "") || null;
  });
  return next;
}

/** Auth intent from ?mode= — customer on /login, admin only from /admin flows. */
export function useAuthModeParam(): "customer" | "admin" | null {
  const [mode] = useState<"customer" | "admin" | null>(() => {
    if (typeof window === "undefined") return null;
    return parseWorkspaceModeParam(new URLSearchParams(window.location.search).get("mode"));
  });
  return mode;
}
