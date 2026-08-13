"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeAuthWorkspaceIntent } from "@/app/actions/auth";
import { AdminAuthShell } from "@/app/admin/auth/AdminAuthShell";
import { LoginForm } from "@/app/login/LoginForm";
import { EmailOtpForm } from "@/app/admin/auth/EmailOtpForm";
import { ForgotPasswordForm } from "@/app/admin/auth/ForgotPasswordForm";

type Mode = "password" | "otp" | "forgot";

/**
 * /app's sign-in — reuses the exact same auth primitives as
 * app/admin/AdminLogin.tsx (EmailOtpForm/ForgotPasswordForm
 * all just call Supabase auth; neither is admin-specific), with client-facing
 * copy instead of "Admin Command Center". One login mechanism, two shells —
 * the post-auth gate (requireClientContext here vs. requireOwnerContext in
 * /admin) is what actually differs, not the sign-in form itself.
 */
export default function AppLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");

  async function handleAuthenticated() {
    await finalizeAuthWorkspaceIntent("customer");
    router.refresh();
  }

  if (mode === "forgot") {
    return (
      <AdminAuthShell title="Reset password" subtitle="Enter your email and we'll send a reset link.">
        <ForgotPasswordForm onBack={() => setMode("password")} />
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell title="Sign in to Stratxcel" subtitle="Welcome back.">
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
        <LoginForm />
      ) : (
        <EmailOtpForm onAuthenticated={handleAuthenticated} />
      )}
    </AdminAuthShell>
  );
}
