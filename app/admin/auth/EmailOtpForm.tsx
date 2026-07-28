"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "./authErrors";
import { AuthStatusMessage } from "./AuthStatusMessage";

const RESEND_COOLDOWN_SECONDS = 30;

export function EmailOtpForm({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (stage === "code") codeInputRef.current?.focus();
  }, [stage]);

  async function sendCode(targetEmail: string) {
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: false },
    });
    if (authError) {
      setError(describeAuthError(authError));
      return false;
    }
    setNotice("If that email has an account, a sign-in code is on its way.");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    const form = new FormData(e.currentTarget);
    const targetEmail = String(form.get("email") ?? "");
    setEmail(targetEmail);
    const ok = await sendCode(targetEmail);
    setPending(false);
    if (ok) setStage("code");
  }

  async function handleCodeSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (authError) {
      setError(describeAuthError(authError));
      setPending(false);
      return;
    }
    onAuthenticated();
  }

  async function handleResend() {
    if (cooldown > 0 || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    await sendCode(email);
    setPending(false);
  }

  if (stage === "email") {
    return (
      <form onSubmit={handleEmailSubmit} noValidate>
        <label className="saut-auth-field" htmlFor="otp-email">
          <span className="saut-auth-field-label">Email</span>
          <div className="saut-auth-input-wrap">
            <input
              id="otp-email"
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
        </div>

        <button type="submit" disabled={pending} className="saut-auth-primary-btn mt-4">
          {pending ? "Sending code…" : "Send sign-in code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCodeSubmit} noValidate>
      <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
        Code sent to <span style={{ color: "var(--saut-text)" }}>{email}</span>
      </p>

      <label className="saut-auth-field mt-3" htmlFor="otp-code">
        <span className="saut-auth-field-label">Sign-in code</span>
        <input
          ref={codeInputRef}
          id="otp-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="saut-input"
          style={{ letterSpacing: "0.4em", textAlign: "center", fontVariantNumeric: "tabular-nums" }}
        />
      </label>

      <div className="mt-3 space-y-2" aria-live="polite">
        {error && <AuthStatusMessage kind="error">{error}</AuthStatusMessage>}
        {notice && !error && <AuthStatusMessage kind="success">{notice}</AuthStatusMessage>}
      </div>

      <button type="submit" disabled={pending || code.length < 6} className="saut-auth-primary-btn mt-4">
        {pending ? "Verifying…" : "Verify code"}
      </button>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || pending}
          className="saut-auth-link-btn !w-auto px-0"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStage("email");
            setCode("");
            setError("");
            setNotice("");
          }}
          className="saut-auth-link-btn !w-auto px-0"
        >
          Change email
        </button>
      </div>
    </form>
  );
}
