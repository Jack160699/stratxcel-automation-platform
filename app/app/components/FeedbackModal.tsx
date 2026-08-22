"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";

/**
 * In-app Feedback (mission item 5) — was: Settings "Send Feedback" ->
 * /contact?intent=feedback, a redirect out to the public marketing site's
 * contact form. Now: one message field, submitted straight to
 * POST /api/platform/feedback (writes into the existing admin inbox table),
 * no redirect anywhere.
 */
export function FeedbackModal({
  open,
  onClose,
  tenantId,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string | undefined;
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    onClose();
    // Reset after the close animation has a moment to run, so the sheet
    // doesn't visibly flash back to a blank form while sliding away.
    setTimeout(() => {
      setMessage("");
      setStatus("idle");
      setError(null);
    }, 200);
  }

  async function submit() {
    if (!tenantId || message.trim().length < 3) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/platform/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, message: message.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(body.error ?? "Could not send feedback. Please try again.");
        return;
      }
      setStatus("sent");
      setTimeout(handleClose, 1400);
    } catch {
      setStatus("error");
      setError("Could not send feedback. Please try again.");
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Send Feedback" size="sm">
      {status === "sent" ? (
        <p className="py-6 text-center text-[15px] font-semibold text-sx-text">Feedback received ✓</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-sx-text-muted">Tell us what went wrong or what you would like improved.</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Type your feedback here…"
            className="w-full resize-none rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 px-3.5 py-3 text-[15px] text-sx-text outline-none transition-colors focus-visible:border-sx-accent"
          />
          {error && <p className="text-xs text-[#FF8A90]">{error}</p>}
          <Button
            variant="primary"
            size="cta"
            disabled={status === "sending" || message.trim().length < 3}
            onClick={submit}
          >
            {status === "sending" ? "Sending…" : "Send Feedback"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
