"use client";

import { useActionState, useEffect, useState } from "react";
import { showToast } from "../../components/Toaster";
import type { BrandFormAction } from "../types";

/**
 * Remove with an inline confirmation step instead of a browser confirm() —
 * "Remove "X"? Cancel | Remove" — so accidental clicks can't delete data.
 * Save/Edit never require this; only destructive actions do.
 */
export function RemoveButton({
  action,
  hiddenFields,
  itemLabel,
}: {
  action: BrandFormAction;
  hiddenFields: Record<string, string | number>;
  itemLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!state) return;
    if (state.ok) showToast(state.message);
    else showToast(state.error, "error");
  }, [state]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs"
        aria-label={`Remove ${itemLabel}`}
      >
        Remove
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-1.5">
      {Object.entries(hiddenFields).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <span className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
        Remove &ldquo;{itemLabel}&rdquo;?
      </span>
      <button type="button" onClick={() => setConfirming(false)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
        Cancel
      </button>
      <button type="submit" disabled={pending} className="saut-btn saut-btn-danger !h-7 !px-2 text-xs">
        {pending ? "Removing…" : "Remove"}
      </button>
    </form>
  );
}
