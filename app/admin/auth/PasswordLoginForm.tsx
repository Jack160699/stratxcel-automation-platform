"use client";

import { useId, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "./authErrors";
import { AuthStatusMessage } from "./AuthStatusMessage";

export function PasswordLoginForm({
  onAuthenticated,
  onForgotPassword,
}: {
  onAuthenticated: () => void;
  onForgotPassword: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (authError) {
      setError(describeAuthError(authError));
      setPending(false);
      return;
    }
    onAuthenticated();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className="saut-auth-field" htmlFor="password-login-email">
        <span className="saut-auth-field-label">Email</span>
        <div className="saut-auth-input-wrap">
          <input
            id="password-login-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@stratxcel.ai"
            className="saut-input"
          />
        </div>
      </label>

      <label className="saut-auth-field" htmlFor={passwordId}>
        <span className="saut-auth-field-label">Password</span>
        <div className="saut-auth-input-wrap">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            placeholder="••••••••••"
            data-has-adornment="true"
            className="saut-input"
          />
          <button
            type="button"
            className="saut-auth-adornment"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            tabIndex={0}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </label>

      <div className="mt-3 space-y-2" aria-live="polite">
        {error && <AuthStatusMessage kind="error">{error}</AuthStatusMessage>}
      </div>

      <button type="submit" disabled={pending} className="saut-auth-primary-btn mt-4">
        {pending ? "Verifying…" : "Enter Command Center"}
      </button>

      <button type="button" onClick={onForgotPassword} className="saut-auth-link-btn mt-1">
        Forgot password?
      </button>
    </form>
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
