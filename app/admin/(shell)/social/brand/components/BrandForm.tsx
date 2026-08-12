"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { showToast } from "../../components/Toaster";
import type { BrandFormAction } from "../types";

const SAVED_FLASH_MS = 1600;

/**
 * Shared Save/Saving…/✓ Saved wrapper for every Brand Brain create/update
 * form. Never reports success until the server action itself resolves ok;
 * on failure the form is left exactly as the user typed it (no reset), and
 * the error is shown inline as well as toasted.
 */
export function BrandForm({
  action,
  children,
  submitLabel,
  className,
  resetOnSuccess = false,
  onSuccess,
  onCancel,
}: {
  action: BrandFormAction;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  /** Clear the form's own inputs after a successful submit — appropriate for "add" forms, not for edit/update forms. */
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  /** Renders a Cancel button beside Save, in the same row — used in edit mode. */
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [showSaved, setShowSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      showToast(state.message);
      setShowSaved(true);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.();
      const t = setTimeout(() => setShowSaved(false), SAVED_FLASH_MS);
      return () => clearTimeout(t);
    }
    showToast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className="saut-btn saut-btn-primary w-fit">
          {pending ? "Saving…" : showSaved ? "✓ Saved" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="saut-btn saut-btn-ghost w-fit">
            Cancel
          </button>
        )}
        {state && !state.ok && (
          <span role="alert" className="text-xs" style={{ color: "var(--saut-danger)" }}>
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
