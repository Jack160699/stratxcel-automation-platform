"use client";

import { useEffect } from "react";

/**
 * Product error boundary for Copilot — never surface Next.js framework
 * digests or production boilerplate to the owner.
 */
export default function CopilotError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[social.copilot.error-boundary]", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div
      className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center"
      role="alert"
      data-copilot-error-boundary="true"
    >
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold tracking-tight" style={{ color: "var(--saut-text)" }}>
          Something went wrong while refreshing this review.
        </h2>
        <p className="text-sm" style={{ color: "var(--saut-text-muted)" }}>
          Your prepared posts are still saved. Try again to reload this review without losing the mission.
        </p>
      </div>
      <button type="button" className="saut-btn saut-btn-primary" onClick={reset} data-copilot-error-retry="true">
        Try again
      </button>
    </div>
  );
}
