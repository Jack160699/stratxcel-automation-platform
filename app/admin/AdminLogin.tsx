"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isAuthApiError } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Mark } from "@/app/components/Mark";

/**
 * Maps GoTrue's error codes to safe, specific copy. Never surfaces raw
 * provider payloads — just enough for the person signing in (or debugging
 * with them) to tell "wrong password" apart from "the service is
 * misconfigured" without needing Auth logs.
 */
function describeAuthError(authError: unknown): string {
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
    default:
      return "Unexpected authentication error. Please try again.";
  }
}

export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [resetNotice, setResetNotice] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    router.refresh();
  }

  async function handleResetRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    setResetNotice("");
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
    // Always show the same message regardless of whether the email exists —
    // GoTrue itself doesn't reveal that, so neither should this UI.
    setResetNotice("If that email has an account, a reset link is on its way.");
  }

  if (mode === "reset") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7">
          <div className="flex items-center gap-3">
            <Mark className="h-8 w-8" />
            <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
              STRATXCEL
            </span>
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white">
            Reset password
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter your email and we&apos;ll send a reset link.
          </p>
          <form onSubmit={handleResetRequest} className="mt-6 space-y-3">
            <label className="block">
              <span className="sr-only">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="Email"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#45c4ff]/60"
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-rose-300">
                {error}
              </p>
            )}
            {resetNotice && (
              <p role="status" className="text-xs text-emerald-300">
                {resetNotice}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="h-11 w-full rounded-xl bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send reset link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
                setResetNotice("");
              }}
              className="h-9 w-full text-center text-xs text-slate-400 hover:text-slate-300"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7">
        <div className="flex items-center gap-3">
          <Mark className="h-8 w-8" />
          <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
            STRATXCEL
          </span>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white">
          Admin console
        </h1>
        <p className="mt-2 text-sm text-slate-400">Internal access only.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#45c4ff]/60"
            />
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#45c4ff]/60"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Open console"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("reset");
              setError("");
            }}
            className="h-9 w-full text-center text-xs text-slate-400 hover:text-slate-300"
          >
            Forgot password?
          </button>
        </form>
      </div>
    </main>
  );
}
