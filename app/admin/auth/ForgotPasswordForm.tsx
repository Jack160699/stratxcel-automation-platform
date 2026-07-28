"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "./authErrors";
import { AuthStatusMessage } from "./AuthStatusMessage";

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setPending(false);
    if (authError) {
      setError(describeAuthError(authError));
      return;
    }
    // Always the same message regardless of whether the email exists —
    // GoTrue itself doesn't reveal that, so neither should this UI.
    setNotice("If that email has an account, a reset link is on its way.");
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className="saut-auth-field" htmlFor="forgot-email">
        <span className="saut-auth-field-label">Email</span>
        <div className="saut-auth-input-wrap">
          <input
            id="forgot-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@stratxcel.ai"
            className="saut-input"
          />
        </div>
      </label>

      <div className="mt-3 space-y-2" aria-live="polite">
        {error && <AuthStatusMessage kind="error">{error}</AuthStatusMessage>}
        {notice && !error && <AuthStatusMessage kind="success">{notice}</AuthStatusMessage>}
      </div>

      <button type="submit" disabled={pending} className="saut-auth-primary-btn mt-4">
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <button type="button" onClick={onBack} className="saut-auth-link-btn mt-1">
        Back to sign in
      </button>
    </form>
  );
}
