"use client";

import { useEffect, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

/** Fires a toast from anywhere — no context/provider wiring needed, matching the existing saut:ask-agent event pattern already used to cross the layout boundary. */
export function showToast(message: string, tone: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("saut:toast", { detail: { message, tone } }));
}

/** Mount once per page that calls showToast(). Non-intrusive, auto-dismissing, announced to screen readers via aria-live. */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    function handle(e: Event) {
      const detail = (e as CustomEvent<{ message: string; tone?: "success" | "error" }>).detail;
      if (!detail?.message) return;
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message: detail.message, tone: detail.tone ?? "success" }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
    }
    window.addEventListener("saut:toast", handle);
    return () => window.removeEventListener("saut:toast", handle);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="saut-toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`saut-toast ${t.tone === "error" ? "saut-toast-error" : "saut-toast-success"}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
