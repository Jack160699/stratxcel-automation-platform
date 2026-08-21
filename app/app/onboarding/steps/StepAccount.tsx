"use client";

import { useId, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { normalizeWebsiteUrl } from "@/lib/identity/smart-url";
import { validateAndNormalizeGoogleMapsInput } from "@/lib/identity/google-maps-normalizer";
import type { OnboardingDraft } from "../types";

export interface AccountInfo {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
}

export function StepAccount({
  account,
  draft,
  onAccountChange,
  onBusinessChange,
}: {
  account: AccountInfo;
  draft: OnboardingDraft;
  onAccountChange: (next: AccountInfo) => void;
  onBusinessChange: (patch: Partial<OnboardingDraft["business"]>) => void;
}) {
  const nameId = useId();
  const websiteId = useId();
  const googleMapsId = useId();

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(account.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [gbpError, setGbpError] = useState<string | null>(null);

  async function saveName() {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setNameError("Enter your name.");
      return;
    }
    setSavingName(true);
    setNameError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    setSavingName(false);
    if (error) {
      setNameError("Couldn't save your name — try again.");
      return;
    }
    onAccountChange({ ...account, displayName: trimmed });
    setEditingName(false);
  }

  function handleWebsiteChange(val: string) {
    setWebsiteError(null);
    onBusinessChange({ website: val });
  }

  function handleWebsiteBlur(val: string) {
    const trimmed = val.trim();
    if (!trimmed) return;
    const normalized = normalizeWebsiteUrl(trimmed);
    if (normalized.ok && normalized.url) {
      onBusinessChange({ website: normalized.url });
      setWebsiteError(null);
    }
  }

  function handleGbpChange(val: string) {
    setGbpError(null);
    const trimmed = val.trim();
    if (!trimmed) {
      onBusinessChange({ googleMapsUrl: "" });
      return;
    }
    const norm = validateAndNormalizeGoogleMapsInput(trimmed);
    if (norm.success) {
      onBusinessChange({
        googleMapsUrl: norm.data.canonicalUrl,
        name: !draft.business.name && norm.data.placeName ? norm.data.placeName : draft.business.name,
      });
      setGbpError(null);
    } else {
      onBusinessChange({ googleMapsUrl: val });
    }
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* SECTION A: Authenticated Google Account */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="font-sx-sans text-base font-semibold text-sx-text">Your StratXcel Account</h3>
          <p className="font-sx-sans text-xs text-sx-text-muted mt-0.5">
            Authenticated login identity for this workspace.
          </p>
        </div>

        {editingName ? (
          <FormField label="Your name" htmlFor={nameId} error={nameError}>
            <div className="flex gap-2">
              <Input
                id={nameId}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? `${nameId}-error` : undefined}
                autoFocus
                className="h-11"
              />
              <Button type="button" variant="primary" size="touch" onClick={saveName} disabled={savingName}>
                {savingName ? "Saving…" : "Save"}
              </Button>
            </div>
          </FormField>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-sx-md border border-sx-border bg-sx-surface-2 p-3.5 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sx-accent/15 text-sx-accent font-bold text-sm">
                {(account.displayName || account.email || "U").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-sx-sans text-sm font-medium text-sx-text truncate">
                  {account.displayName || "User"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-sx-sans text-xs text-sx-text-muted truncate">
                    {account.email ?? "—"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-sx-pill px-1.5 py-0.5 font-sx-mono text-[9px] uppercase tracking-wider bg-sx-success/15 text-sx-success">
                    <span>✓</span> Google account connected
                  </span>
                </div>
              </div>
            </div>
            <div className="flex sm:self-center self-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingName(true)}>
                Edit Name
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-sx-border/60" />

      {/* SECTION B: Business Discovery Sources */}
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="font-sx-sans text-base font-semibold text-sx-text">Where is your business online?</h3>
          <p className="font-sx-sans text-xs text-sx-text-muted mt-0.5">
            These help us understand your business before we set everything up.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* Website Input */}
          <FormField
            label="Website / Domain"
            htmlFor={websiteId}
            error={websiteError}
            hint="Enter your domain or website link. Natural inputs like yourwebsite.com are accepted."
          >
            <Input
              id={websiteId}
              type="text"
              value={draft.business.website}
              onChange={(e) => handleWebsiteChange(e.target.value)}
              onBlur={(e) => handleWebsiteBlur(e.target.value)}
              placeholder="yourwebsite.com"
              className="h-11 font-mono text-sm"
              aria-invalid={Boolean(websiteError)}
              aria-describedby={websiteError ? `${websiteId}-error` : undefined}
            />
          </FormField>

          {/* Google Maps / Business Profile Input */}
          <FormField
            label="Google Maps / Google Business Profile"
            htmlFor={googleMapsId}
            error={gbpError}
            hint="Supports maps.app.goo.gl, google.com/maps, g.page, and search share links."
          >
            <Input
              id={googleMapsId}
              type="text"
              value={draft.business.googleMapsUrl ?? ""}
              onChange={(e) => handleGbpChange(e.target.value)}
              placeholder="Paste your Google Maps or Business Profile link"
              className="h-11 font-mono text-sm"
              aria-invalid={Boolean(gbpError)}
              aria-describedby={gbpError ? `${googleMapsId}-error` : undefined}
            />
          </FormField>
        </div>

        <div className="rounded-sx-md bg-sx-surface-2/40 border border-sx-border/60 p-3 text-xs text-sx-text-subtle leading-relaxed">
          <p>
            💡 When you continue, StratXcel will research your public profile and prepare your business details automatically for your review.
          </p>
        </div>
      </div>
    </div>
  );
}
