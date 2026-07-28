"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminAuthShell } from "./auth/AdminAuthShell";
import { PasswordLoginForm } from "./auth/PasswordLoginForm";
import { EmailOtpForm } from "./auth/EmailOtpForm";
import { ForgotPasswordForm } from "./auth/ForgotPasswordForm";

type Mode = "password" | "otp" | "forgot";

export default function AdminLogin() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");

  function handleAuthenticated() {
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
        <PasswordLoginForm onAuthenticated={handleAuthenticated} onForgotPassword={() => setMode("forgot")} />
      ) : (
        <EmailOtpForm onAuthenticated={handleAuthenticated} />
      )}
    </AdminAuthShell>
  );
}
