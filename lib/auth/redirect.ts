/**
 * Sanitizes a redirect path parameter (e.g. `next` or `redirectTo` query param).
 * Ensures the target is a valid relative path starting with a single '/'
 * and NOT starting with '//', '\\', or containing protocol specifiers (e.g. 'javascript:').
 * Fails closed to defaultFallback (defaults to '/app').
 */
export function sanitizeRedirectUrl(
  input: string | null | undefined,
  defaultFallback: string = "/app"
): string {
  if (!input || typeof input !== "string") {
    return defaultFallback;
  }

  const trimmed = input.trim();

  // Reject empty string
  if (!trimmed) {
    return defaultFallback;
  }

  // Must start with exactly one '/' and not '//' or '/\'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return defaultFallback;
  }

  // Reject URLs containing control characters or scheme separators before path
  try {
    // Attempt parsing with dummy origin to verify structure
    const dummyOrigin = "https://stratxcel.local";
    const parsed = new URL(trimmed, dummyOrigin);

    // Ensure origin matches dummyOrigin (prohibits protocol relative or external domain overrides)
    if (parsed.origin !== dummyOrigin) {
      return defaultFallback;
    }

    // Prohibit javascript: or data: or other dangerous pseudo-protocols in pathname
    if (/^[a-zA-Z0-9+-.]+:/i.test(parsed.pathname)) {
      return defaultFallback;
    }

    // Return the safe relative path (pathname + search + hash)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultFallback;
  }
}
