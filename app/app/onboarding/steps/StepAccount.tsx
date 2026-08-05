"use client";

import { useId, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";

export interface AccountInfo {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
}

/**
 * Confirmation-only step — name/email already exist from signup. Editing
 * the display name writes straight to Supabase Auth user metadata via
 * supabase.auth.updateUser(), the same mechanism SignupForm.tsx uses to set
 * it in the first place. No internal user id is ever shown.
 */
export function StepAccount({
  account,
  onAccountChange,
}: {
  account: AccountInfo;
  onAccountChange: (next: AccountInfo) => void;
}) {
  const nameId = useId();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(account.displayName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveName() {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setSaveError("Enter your name.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSaving(false);
    if (error) {
      setSaveError("Couldn't save your name — try again.");
      return;
    }
    onAccountChange({ ...account, displayName: trimmed });
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
        This is the account you signed up with. Confirm your name, then continue.
      </p>

      {editing ? (
        <FormField label="Your name" htmlFor={nameId} error={saveError}>
          <div className="flex gap-2">
            <Input
              id={nameId}
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              aria-invalid={!!saveError}
              aria-describedby={saveError ? `${nameId}-error` : undefined}
              autoFocus
              className="h-11"
            />
            <Button type="button" variant="primary" size="touch" onClick={saveName} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </FormField>
      ) : (
        <div className="flex items-center justify-between rounded-sx-md border border-sx-border bg-sx-surface-2 px-4 py-3">
          <div>
            <p className="font-sx-sans text-[10.5px] font-medium uppercase tracking-[0.1em] text-sx-text-muted">Name</p>
            <p className="mt-0.5 font-sx-sans text-[14px] text-sx-text">{account.displayName || "—"}</p>
          </div>
          <Button type="button" variant="ghost" size="touch" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
      )}

      <div className="rounded-sx-md border border-sx-border bg-sx-surface-2 px-4 py-3">
        <p className="font-sx-sans text-[10.5px] font-medium uppercase tracking-[0.1em] text-sx-text-muted">Email</p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="font-sx-sans text-[14px] text-sx-text">{account.email ?? "—"}</p>
          {account.email && (
            <span
              className={`rounded-sx-pill px-2 py-0.5 font-sx-mono text-[9.5px] uppercase tracking-[0.08em] ${
                account.emailVerified ? "bg-[rgb(52_199_89_/_0.14)] text-sx-success" : "bg-[rgb(243_197_92_/_0.16)] text-[#F3C55C]"
              }`}
            >
              {account.emailVerified ? "Verified" : "Unverified"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
