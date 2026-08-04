"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/app/admin/auth/authErrors";
import { resolvePostLoginRedirect } from "@/app/actions/auth";
import { EyeIcon, EyeOffIcon } from "@/app/components/auth/PasswordVisibilityIcons";

type Stage = "checking" | "ready" | "invalid" | "success";

/**
 * Reached only via the link Supabase emails from resetPasswordForEmail().
 * Exchanges the one-time recovery code for a session, then sets the new
 * password via the official updateUser() call — the password is never
 * handled or stored anywhere else. After success the recovery session is
 * an ordinary authenticated session, so the same role-routing used after
 * /login applies here too.
 */
export function ResetPasswordForm() {
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
        setStage(exchangeError ? "invalid" : "ready");
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
    setError("");

    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(describeAuthError(updateError));
      return;
    }

    setStage("success");
    const destination = await resolvePostLoginRedirect();
    setTimeout(() => {
      router.push(destination);
      router.refresh();
    }, 1500);
  }

  if (stage === "checking") {
    return (
      <p role="status" className="font-sx-sans text-sm text-sx-text-muted">
        Verifying reset link…
      </p>
    );
  }

  if (stage === "invalid") {
    return (
      <div className="space-y-4">
        <p role="alert" className="font-sx-sans text-sm text-sx-danger">
          This reset link is invalid or has expired.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex h-10 w-full items-center justify-center rounded-sx-sm border border-sx-border-strong px-4 font-sx-sans text-sm font-medium text-sx-text no-underline transition-colors hover:bg-sx-surface-2"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <p role="status" className="font-sx-sans text-sm text-sx-text-muted">
        Password updated. Taking you to your workspace…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <label className="block" htmlFor={passwordId}>
        <span className="mb-1.5 block font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-muted">
          New password
        </span>
        <div className="relative">
          <input
            id={passwordId}
            name="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="h-10 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 pr-10 font-sx-sans text-sm text-sx-text placeholder:text-sx-text-subtle outline-none transition-colors focus-visible:border-sx-accent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-sx-text-subtle transition-colors hover:text-sx-text-muted"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </label>

      <label className="block" htmlFor={confirmId}>
        <span className="mb-1.5 block font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-muted">
          Confirm new password
        </span>
        <input
          id={confirmId}
          name="confirm"
          type={showPassword ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Re-enter your new password"
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
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
