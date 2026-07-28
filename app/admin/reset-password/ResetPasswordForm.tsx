"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthApiError } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AdminAuthShell } from "@/app/admin/auth/AdminAuthShell";
import { AuthStatusMessage } from "@/app/admin/auth/AuthStatusMessage";

type Stage = "checking" | "ready" | "invalid" | "success";

/**
 * Reached only via the link Supabase emails from resetPasswordForEmail().
 * Exchanges the one-time recovery code for a session, then lets the user
 * set a new password via the official updateUser() call — never handles
 * or stores the password anywhere else. This does not bypass admin
 * authorization: after a new password is set, /admin still runs its
 * normal stratxcel_admins check like any other sign-in.
 */
export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<Stage>("checking");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();
  const confirmId = useId();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const code = searchParams.get("code");

    async function establishSession() {
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStage("invalid");
          return;
        }
        setStage("ready");
        return;
      }

      // Older implicit-flow links land the session directly via the URL
      // hash, which the browser client already processes on load.
      const { data } = await supabase.auth.getSession();
      setStage(data.session ? "ready" : "invalid");
    }

    void establishSession();
  }, [searchParams]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password !== confirm) {
      setError("Passwords do not match.");
      setPending(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      if (isAuthApiError(updateError) && updateError.code === "weak_password") {
        setError("Password is too weak — use a longer, less predictable password.");
      } else if (isAuthApiError(updateError) && updateError.code === "same_password") {
        setError("New password must be different from your current password.");
      } else {
        setError("Could not update password. Please try the reset link again.");
      }
      return;
    }

    setStage("success");
    setTimeout(() => router.push("/admin"), 1500);
  }

  return (
    <AdminAuthShell title="Set a new password">
      {stage === "checking" && (
        <p className="text-sm" style={{ color: "var(--saut-text-subtle)" }}>
          Verifying reset link…
        </p>
      )}

      {stage === "invalid" && (
        <>
          <AuthStatusMessage kind="error">This reset link is invalid or has expired.</AuthStatusMessage>
          <a href="/admin" className="saut-auth-primary-btn mt-4 inline-flex items-center justify-center no-underline">
            Back to sign in
          </a>
        </>
      )}

      {stage === "success" && (
        <AuthStatusMessage kind="success">Password updated. Redirecting to the admin console…</AuthStatusMessage>
      )}

      {stage === "ready" && (
        <form onSubmit={handleSubmit} noValidate>
          <label className="saut-auth-field" htmlFor={passwordId}>
            <span className="saut-auth-field-label">New password</span>
            <div className="saut-auth-input-wrap">
              <input
                id={passwordId}
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="New password"
                data-has-adornment="true"
                className="saut-input"
              />
              <button
                type="button"
                className="saut-auth-adornment"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <label className="saut-auth-field" htmlFor={confirmId}>
            <span className="saut-auth-field-label">Confirm new password</span>
            <div className="saut-auth-input-wrap">
              <input
                id={confirmId}
                name="confirm"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Confirm new password"
                className="saut-input"
              />
            </div>
          </label>

          <div className="mt-3 space-y-2" aria-live="polite">
            {error && <AuthStatusMessage kind="error">{error}</AuthStatusMessage>}
          </div>

          <button type="submit" disabled={pending} className="saut-auth-primary-btn mt-4">
            {pending ? "Updating…" : "Update password"}
          </button>
        </form>
      )}
    </AdminAuthShell>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.9 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a13.5 13.5 0 0 1-3.17 3.88M6.6 6.6C4.2 8.1 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.2 3.3-.55"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
