"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/app/admin/auth/authErrors";

/**
 * Always shows the same success copy on submit — GoTrue's
 * resetPasswordForEmail() itself never reveals whether the address has an
 * account, so this UI doesn't either. Only genuine API failures (rate
 * limit, network, misconfiguration) get a distinct error message.
 */
export function ForgotPasswordForm() {
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError("");

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) {
      setError("Enter your email address.");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);

    if (authError) {
      setError(describeAuthError(authError));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p role="status" className="font-sx-sans text-sm leading-relaxed text-sx-text-muted">
        If an account exists for that email, a password reset link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-muted">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="h-10 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 font-sx-sans text-sm text-sx-text placeholder:text-sx-text-subtle outline-none transition-colors focus-visible:border-sx-accent"
        />
      </label>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="font-sx-sans text-[12.5px] text-sx-danger">
            {error}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-sx-sm bg-sx-accent font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors hover:bg-[color:var(--sx-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center font-sx-sans text-[12.5px] text-sx-text-muted">
        <Link href="/login" className="text-sx-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
