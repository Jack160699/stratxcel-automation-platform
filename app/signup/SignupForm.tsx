"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/app/admin/auth/authErrors";
import { resolvePostLoginRedirect, finalizeAuthWorkspaceIntent } from "@/app/actions/auth";
import { useNextParam } from "@/lib/auth/use-next-param";
import { trackFunnel } from "@/lib/analytics/events";
import { EyeIcon, EyeOffIcon } from "@/app/components/auth/PasswordVisibilityIcons";

import { GoogleOAuthButton } from "@/app/components/auth/GoogleOAuthButton";
import { GoogleOneTap } from "@/app/components/auth/GoogleOneTap";

type Stage = "form" | "verify";

/**
 * Real self-service signup via supabase.auth.signUp() — never the
 * service-role key, never a direct auth.users insert. The name is stored
 * only as Supabase Auth user metadata (full_name); no profile table exists
 * yet, so nothing is written beyond what supabase-js does for us. A brand
 * new account has no stratxcel_admins row and no tenant_members row, so
 * resolvePostLoginRedirect() always sends it to /app, where the existing
 * zero-membership OnboardingPanel takes over.
 */
export function SignupForm() {
  const router = useRouter();
  const next = useNextParam();
  const [stage, setStage] = useState<Stage>("form");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();
  const confirmId = useId();
  const termsId = useId();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError("");

    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const acceptedTerms = form.get("terms") === "on";

    if (name.length < 2) {
      setError("Enter your name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (!acceptedTerms) {
      setError("You must accept the Terms of Service to continue.");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    setPending(false);

    if (authError) {
      setError(describeAuthError(authError));
      return;
    }

    if (data.session) {
      trackFunnel("signup_completed", { method: "password" });
      await finalizeAuthWorkspaceIntent("customer");
      const destination = next ?? (await resolvePostLoginRedirect());
      router.push(destination);
      router.refresh();
      return;
    }

    setStage("verify");
  }

  if (stage === "verify") {
    return (
      <p role="status" className="font-sx-sans text-sm leading-relaxed text-sx-text-muted">
        Check your email to confirm your account. Once confirmed, sign in and we&rsquo;ll take you straight into your
        workspace.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <GoogleOneTap next={next ?? undefined} mode="customer" onError={setError} />
      <GoogleOAuthButton next={next ?? undefined} mode="customer" onError={setError} />

      <div className="relative flex items-center justify-center py-1">
        <div className="w-full border-t border-sx-border" />
        <span className="absolute bg-sx-surface px-3 font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-subtle">
          or continue with email
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block font-sx-sans text-[11px] font-medium uppercase tracking-[0.08em] text-sx-text-muted">
            Name
          </span>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            placeholder="Your name"
            className="h-10 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 font-sx-sans text-sm text-sx-text placeholder:text-sx-text-subtle outline-none transition-colors focus-visible:border-sx-accent"
          />
        </label>

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
            Confirm password
          </span>
          <input
            id={confirmId}
            name="confirm"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            className="h-10 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3 font-sx-sans text-sm text-sx-text placeholder:text-sx-text-subtle outline-none transition-colors focus-visible:border-sx-accent"
          />
        </label>

        <label htmlFor={termsId} className="flex items-start gap-2.5">
          <input
            id={termsId}
            name="terms"
            type="checkbox"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-sx-border-strong bg-sx-surface-2 accent-[color:var(--sx-accent)]"
          />
          <span className="font-sx-sans text-[12.5px] leading-relaxed text-sx-text-muted">
            I agree to the{" "}
            <Link href="/terms" className="text-sx-accent hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-sx-accent hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
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
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
