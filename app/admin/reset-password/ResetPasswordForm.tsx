"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthApiError } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Mark } from "@/app/components/Mark";

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
    <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7">
        <div className="flex items-center gap-3">
          <Mark className="h-8 w-8" />
          <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
            STRATXCEL
          </span>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white">
          Set a new password
        </h1>

        {stage === "checking" && (
          <p className="mt-4 text-sm text-slate-400">Verifying reset link…</p>
        )}

        {stage === "invalid" && (
          <>
            <p className="mt-4 text-sm text-slate-400">
              This reset link is invalid or has expired.
            </p>
            <a
              href="/admin"
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/15 text-sm font-semibold text-slate-300 hover:bg-white/[0.05]"
            >
              Back to sign in
            </a>
          </>
        )}

        {stage === "success" && (
          <p className="mt-4 text-sm text-emerald-300">
            Password updated. Redirecting to the admin console…
          </p>
        )}

        {stage === "ready" && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <label className="block">
              <span className="sr-only">New password</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="New password"
                className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#45c4ff]/60"
              />
            </label>
            <label className="block">
              <span className="sr-only">Confirm new password</span>
              <input
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Confirm new password"
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
              {pending ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
