"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { describeAuthError } from "@/app/admin/auth/authErrors";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Turns a paid, unclaimed guest order into an account. Supabase's own
 * signInWithOtp/verifyOtp *is* the "cryptographically strong opaque claim
 * mechanism" — a single-use, time-limited 6-digit code delivered to the
 * email the purchase is registered to. shouldCreateUser is left at its
 * default (true): a brand-new customer's account is created right here,
 * which is exactly the "secure access/account creation" step the funnel
 * calls for, using the one auth system this app already has.
 *
 * Once verified, POSTs the claim itself — the server re-checks payment
 * status and email match before attaching anything (see
 * app/api/platform/audit/claim/route.ts); this form never assumes success
 * client-side.
 */
export function ClaimEmailOtpForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"email" | "code" | "claiming">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(targetEmail: string) {
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithOtp({ email: targetEmail });
    if (authError) {
      setError(describeAuthError(authError));
      return false;
    }
    setNotice(`Code sent to ${targetEmail}.`);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    return true;
  }

  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    const ok = await sendCode(email.trim());
    setPending(false);
    if (ok) setStage("code");
  }

  async function handleCodeSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (authError) {
      setError(describeAuthError(authError));
      setPending(false);
      return;
    }

    setStage("claiming");
    try {
      const res = await fetch("/api/platform/audit/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditOrderId: orderId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not access your Audit. Please try again.");
        setStage("code");
        setPending(false);
        return;
      }
      router.push("/app/audit");
    } catch {
      setError("Network error. Please try again.");
      setStage("code");
      setPending(false);
    }
  }

  if (stage === "claiming") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
        <p className="font-sx-sans text-sm text-sx-text-muted">Securing your Audit access…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="text-center">
        <h1 className="font-sx-sans text-xl font-semibold text-sx-text">Your Stratxcel Audit has started.</h1>
        <p className="mt-2 text-sm text-sx-text-muted">
          Your payment is confirmed. Secure your Audit access to continue.
        </p>
      </div>

      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 sm:p-6">
        {error && (
          <div className="mb-3">
            <ErrorState message={error} />
          </div>
        )}

        {stage === "email" ? (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
            <Field label="Confirm the email you paid with">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.in" />
            </Field>
            <Button type="submit" variant="primary" size="touch" disabled={pending}>
              {pending ? "Sending code…" : "Send access code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
            {notice && !error && <p className="text-xs text-sx-text-muted">{notice}</p>}
            <Field label="6-digit code">
              <Input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="text-center tracking-[0.4em]"
              />
            </Field>
            <Button type="submit" variant="primary" size="touch" disabled={pending || code.length < 6}>
              {pending ? "Verifying…" : "Continue"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => sendCode(email.trim())}
                disabled={cooldown > 0 || pending}
                className="font-semibold text-sx-accent hover:underline disabled:opacity-50"
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
                className="text-sx-text-subtle hover:text-sx-text"
              >
                Change email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
