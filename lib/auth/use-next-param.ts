"use client";

import { useState } from "react";
import { sanitizeRedirectUrl } from "./redirect";

/**
 * The sanitized `?next=` destination for the current page, or null when
 * there isn't one.
 *
 * The public Audit gate (app/audit/page.tsx) sends signed-out visitors to
 * `/login?next=/app/audit`, and the OAuth callback route already honours
 * that param — but the password and One Tap paths resolved their
 * destination without ever reading it, so an Audit CTA click landed on /app
 * and the customer lost their place. This is the shared read.
 *
 * Deliberately reads from `window.location` inside an effect rather than
 * `useSearchParams()`: the value is only needed after an interaction, and
 * this keeps /login and /signup statically renderable with no Suspense
 * boundary. Every value goes through sanitizeRedirectUrl(), which fails
 * closed to a relative path, so an attacker-supplied `next` can never send
 * a freshly authenticated user off-origin.
 */
export function useNextParam(): string | null {
  const [next] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("next");
    if (!raw) return null;
    return sanitizeRedirectUrl(raw, "") || null;
  });

  return next;
}
