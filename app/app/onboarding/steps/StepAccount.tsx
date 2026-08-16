"use client";

import { useId, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormField } from "../FormField";
import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { SocialConnection, SocialPlatformKey } from "../types";

export interface AccountInfo {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
}

const PLATFORM_CONFIG: Record<
  SocialPlatformKey,
  { label: string; placeholder: string; helperText: string; defaultType: "handle" | "phone" | "url" }
> = {
  instagram: {
    label: "Instagram",
    placeholder: "@yourbrand",
    helperText: "Enter your official Instagram handle (e.g. @stratxcel.ai)",
    defaultType: "handle",
  },
  facebook: {
    label: "Facebook",
    placeholder: "Facebook Page Name or URL",
    helperText: "Enter your Facebook Business Page name or link",
    defaultType: "url",
  },
  whatsapp: {
    label: "WhatsApp",
    placeholder: "+91 98765 43210",
    helperText: "Enter your official WhatsApp Business phone number",
    defaultType: "phone",
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "company/yourbrand or Profile URL",
    helperText: "Enter your LinkedIn Company Page handle or URL",
    defaultType: "url",
  },
  youtube: {
    label: "YouTube",
    placeholder: "@YourChannel or Channel URL",
    helperText: "Enter your YouTube handle or channel link",
    defaultType: "handle",
  },
  threads: {
    label: "Threads",
    placeholder: "@yourbrand",
    helperText: "Enter your official Threads handle",
    defaultType: "handle",
  },
  x: {
    label: "X (Twitter)",
    placeholder: "@yourhandle",
    helperText: "Enter your official X/Twitter handle",
    defaultType: "handle",
  },
};

export function StepAccount({
  account,
  connections = [],
  onAccountChange,
  onConnectionsChange,
}: {
  account: AccountInfo;
  connections: SocialConnection[];
  onAccountChange: (next: AccountInfo) => void;
  onConnectionsChange: (next: SocialConnection[]) => void;
}) {
  const nameId = useId();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(account.displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Connection dialog state
  const [activePlatform, setActivePlatform] = useState<SocialPlatformKey | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

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

  function handleOpenConnect(platform: SocialPlatformKey) {
    const existing = connections.find((c) => c.platform === platform);
    setActivePlatform(platform);
    setInputValue(existing?.handle || existing?.url || "");
    setInputError(null);
  }

  function handleSaveConnection() {
    if (!activePlatform) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setInputError("Please enter your account handle, number, or link.");
      return;
    }

    setConnecting(true);
    setInputError(null);

    setTimeout(() => {
      let handle = trimmed;
      let url = trimmed;
      if (activePlatform === "instagram" || activePlatform === "threads" || activePlatform === "youtube") {
        if (!handle.startsWith("@") && !handle.startsWith("http")) handle = `@${handle}`;
      }

      const nextConnections = connections.filter((c) => c.platform !== activePlatform);
      nextConnections.push({
        platform: activePlatform,
        handle: handle.startsWith("@") || activePlatform === "whatsapp" ? handle : undefined,
        url: url.startsWith("http") ? url : undefined,
        displayName: handle,
        status: "connected",
        connectedAt: new Date().toISOString(),
      });

      onConnectionsChange(nextConnections);
      setConnecting(false);
      setActivePlatform(null);
      setInputValue("");
    }, 300);
  }

  function handleDisconnect(platform: SocialPlatformKey) {
    const nextConnections = connections.filter((c) => c.platform !== platform);
    nextConnections.push({
      platform,
      status: "not_connected",
    });
    onConnectionsChange(nextConnections);
    if (activePlatform === platform) setActivePlatform(null);
  }

  const platforms: SocialPlatformKey[] = ["instagram", "facebook", "whatsapp", "linkedin", "youtube", "threads"];

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* SECTION A: Authenticated Google Account */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-sx-sans text-sm font-semibold text-sx-text">Your StratXcel Account</h3>
            <p className="font-sx-sans text-xs text-sx-text-muted">Authenticated login identity for this workspace.</p>
          </div>
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
                <p className="font-sx-sans text-sm font-medium text-sx-text truncate">{account.displayName || "User"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-sx-sans text-xs text-sx-text-muted truncate">{account.email ?? "—"}</span>
                  {account.email && (
                    <span
                      className={`rounded-sx-pill px-1.5 py-0.5 font-sx-mono text-[9px] uppercase tracking-wider ${
                        account.emailVerified
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {account.emailVerified ? "Verified" : "Unverified"}
                    </span>
                  )}
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

      {/* SECTION B: Connect Business Channels */}
      <div className="flex flex-col gap-3.5">
        <div>
          <h3 className="font-sx-sans text-sm font-semibold text-sx-text">Connect your business channels</h3>
          <p className="font-sx-sans text-xs text-sx-text-muted mt-0.5">
            Authorize the channels you want StratXcel to monitor, audit, and publish to.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {platforms.map((key) => {
            const config = PLATFORM_CONFIG[key];
            const connection = connections.find((c) => c.platform === key);
            const isConnected = connection?.status === "connected";
            const identifier = connection?.handle || connection?.displayName || connection?.url;

            return (
              <div
                key={key}
                data-platform={key}
                className={`flex items-center justify-between gap-3 p-3 rounded-sx-md border transition-colors ${
                  isConnected
                    ? "border-emerald-500/30 bg-emerald-950/10"
                    : "border-sx-border bg-sx-surface-2/60 hover:bg-sx-surface-2"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-sm bg-sx-surface-1 border border-sx-border">
                    <PlatformIcon name={key} className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-sx-sans text-xs font-semibold text-sx-text truncate">{config.label}</p>
                    {isConnected ? (
                      <p className="font-sx-sans text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1">
                        <span>✓</span>
                        <span className="truncate">{identifier || "Connected"}</span>
                      </p>
                    ) : (
                      <p className="font-sx-sans text-[11px] text-sx-text-subtle">Not connected</p>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => handleDisconnect(key)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-sx-sm text-sx-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleOpenConnect(key)}
                      className="h-8 text-xs font-semibold"
                    >
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Explicit Connection Modal / Prompt */}
      {activePlatform && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-sx-lg border border-sx-border bg-sx-surface-1 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon name={activePlatform} className="h-5 w-5" />
                <h4 id="connect-dialog-title" className="font-sx-sans text-base font-semibold text-sx-text">
                  Connect {PLATFORM_CONFIG[activePlatform].label}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setActivePlatform(null)}
                className="text-sx-text-muted hover:text-sx-text text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-sx-text-muted leading-relaxed">
              {PLATFORM_CONFIG[activePlatform].helperText}
            </p>

            <FormField
              label={`${PLATFORM_CONFIG[activePlatform].label} Account`}
              htmlFor="platform-input"
              error={inputError}
            >
              <Input
                id="platform-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={PLATFORM_CONFIG[activePlatform].placeholder}
                autoFocus
                className="h-11 text-sm font-mono"
              />
            </FormField>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="touch"
                onClick={() => setActivePlatform(null)}
                disabled={connecting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="touch"
                onClick={handleSaveConnection}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : `Authorize ${PLATFORM_CONFIG[activePlatform].label}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
