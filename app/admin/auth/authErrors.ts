import { isAuthApiError } from "@supabase/supabase-js";

/**
 * Maps GoTrue's error codes to safe, specific copy. Never surfaces raw
 * provider payloads — just enough for the person signing in (or debugging
 * with them) to tell "wrong password" apart from "the service is
 * misconfigured" without needing Auth logs.
 */
export function describeAuthError(authError: unknown): string {
  if (!isAuthApiError(authError)) {
    return "Unexpected authentication error. Please try again.";
  }
  switch (authError.code) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "email_not_confirmed":
      return "Email confirmation required.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts — try again later.";
    case "user_banned":
    case "email_provider_disabled":
    case "signup_disabled":
      return "Authentication service configuration error.";
    case "otp_expired":
      return "That code is invalid or has expired.";
    case "weak_password":
      return "Password is too weak — use a longer, less predictable password.";
    case "same_password":
      return "New password must be different from your current password.";
    default:
      return "Unexpected authentication error. Please try again.";
  }
}
