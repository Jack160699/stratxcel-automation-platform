"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/app/admin/auth/authErrors";
import { finalizeAuthWorkspaceIntent } from "@/app/actions/auth";
import { AdminAuthShell } from "./auth/AdminAuthShell";
import { EmailOtpForm } from "./auth/EmailOtpForm";
import { ForgotPasswordForm } from "./auth/ForgotPasswordForm";
import { AuthStatusMessage } from "./auth/AuthStatusMessage";

type Mode = "password" | "otp" | "forgot";

export default function AdminLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const passwordId = useId();

  async function handleAuthenticated() {
    await finalizeAuthWorkspaceIntent("admin");
    router.refresh();
  }

  async function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    await handleAuthenticated();
  }

  if (mode === "forgot") {
    return (
      <AdminAuthShell title="Reset password" subtitle="Enter your email and we'll send a reset link.">
        <ForgotPasswordForm onBack={() => setMode("password")} />
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell title="Admin Command Center" subtitle="Authorized access only.">
      <div className="saut-authtabs" role="tablist" aria-label="Sign-in method">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "password"}
          data-active={mode === "password"}
          className="saut-authtab"
          onClick={() => setMode("password")}
        >
          Password
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "otp"}
          data-active={mode === "otp"}
          className="saut-authtab"
          onClick={() => setMode("otp")}
        >
          Email code
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} noValidate>
          <label className="saut-auth-field" htmlFor="admin-password-login-email">
            <span className="saut-auth-field-label">Email</span>
            <div className="saut-auth-input-wrap">
              <input id="admin-password-login-email" name="email" type="email" required autoComplete="email" placeholder="you@stratxcel.ai" className="saut-input" />
            </div>
          </label>
          <label className="saut-auth-field" htmlFor={passwordId}>
            <span className="saut-auth-field-label">Password</span>
            <div className="saut-auth-input-wrap">
              <input id={passwordId} name="password" type="password" required autoComplete="current-password" placeholder="••••••••••" className="saut-input" />
            </div>
          </label>
          {error && <AuthStatusMessage kind="error">{error}</AuthStatusMessage>}
          <button type="submit" disabled={pending} className="saut-auth-primary-btn mt-4">{pending ? "Verifying…" : "Enter Command Center"}</button>
          <button type="button" onClick={() => setMode("forgot")} className="saut-auth-link-btn mt-1">Forgot password?</button>
        </form>
      ) : (
        <EmailOtpForm onAuthenticated={handleAuthenticated} />
      )}
    </AdminAuthShell>
  );
}
