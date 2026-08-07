"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Already-authenticated path: claim the order against the current session
 * and move on. Covers both a returning customer buying again and the tail
 * end of the OTP flow once ClaimEmailOtpForm has established a session.
 */
export function ClaimAndContinue({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function claim() {
      try {
        const res = await fetch("/api/platform/audit/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auditOrderId: orderId }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Could not access your Audit. Please try again.");
          return;
        }
        router.push("/app/audit");
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      }
    }
    claim();
    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-sx-sans text-sm text-sx-text-muted">{error}</p>
        <a href="/contact?intent=consultation" className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline">
          Talk to the team →
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sx-accent border-t-transparent" />
      <p className="font-sx-sans text-sm text-sx-text-muted">Securing your Audit access…</p>
    </div>
  );
}
