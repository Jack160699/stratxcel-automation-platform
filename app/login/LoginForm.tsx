"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/app/admin/auth/authErrors";
import { resolvePostLoginRedirect } from "@/app/actions/auth";
import { useNextParam } from "@/lib/auth/use-next-param";
import { trackFunnel } from "@/lib/analytics/events";
import { EyeIcon, EyeOffIcon } from "@/app/components/auth/PasswordVisibilityIcons";

import { GoogleOAuthButton } from "@/app/components/auth/GoogleOAuthButton";
import { GoogleOneTap } from "@/app/components/auth/GoogleOneTap";

export function LoginForm() {
  const router = useRouter();
  const next = useNextParam();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError("");

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(describeAuthError(authError));
      setPending(false);
      return;
    }

    // Honour the Audit CTA's ?next= so the customer resumes where they left off.
    const destination = next ?? (await resolvePostLoginRedirect());
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <GoogleOneTap next={next ?? undefined} onError={setError} />
      <GoogleOAuthButton next={next ?? undefined} onError={setError} />

      <div className="relative flex items-center justify-center py-1">
        <div className="w-full border-t border-sx-border" />
        <span className="absolute bg-sx-surface px-3 font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-subtle">
          or continue with email
        </span>
      </div>

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

        <label className="block" htmlFor={passwordId}>
          <span className="mb-1.5 block font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-muted">
            Password
          </span>
          <div className="relative">
            <input
              id={passwordId}
              name="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
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

        <div className="flex justify-end">
          <Link href="/forgot-password" className="font-sx-sans text-[12.5px] text-sx-accent hover:underline">
            Forgot password?
          </Link>
        </div>

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
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
