"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/components/theme/ThemeProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WHATSAPP_NUMBER } from "@/lib/constants";

type EmailState =
  | { status: "loading"; email: null }
  | { status: "success"; email: string | null }
  | { status: "error"; email: null };

/**
 * V1 settings — StratXcel App reference "Settings" screen composition
 * (Profile & Login, Appearance, Support), restyled around it while keeping
 * the existing, deliberate scope boundary: only persisted identity and
 * supported account actions render as controls. The reference also shows
 * WhatsApp notification toggles and a Hinglish language switch — neither
 * has real backing (no digest/alert delivery system, no i18n system), so
 * they're not implemented here rather than faked. Support/Feedback links
 * are real (lib/constants.js's WHATSAPP_NUMBER, the existing /contact route).
 */
export default function SettingsPage() {
  const { active } = useCurrentTenant();
  const { theme, setTheme } = useTheme();
  const [emailState, setEmailState] = useState<EmailState>({ status: "loading", email: null });

  useEffect(() => {
    let current = true;
    async function loadEmail() {
      try {
        const { data, error } = await createSupabaseBrowserClient().auth.getUser();
        if (!current) return;
        if (error) {
          setEmailState({ status: "error", email: null });
          return;
        }
        setEmailState({ status: "success", email: data.user?.email ?? null });
      } catch {
        if (current) setEmailState({ status: "error", email: null });
      }
    }
    void loadEmail();
    return () => {
      current = false;
    };
  }, []);

  const emailLabel =
    emailState.status === "loading"
      ? "Loading…"
      : emailState.status === "error"
        ? "Unavailable"
        : emailState.email ?? "Not available";

  return (
    <div data-sx-ui="new-settings" className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl font-semibold text-sx-text">Settings{active ? ` · ${active.name}` : ""}</h1>
        <p className="sx-hi text-xs text-sx-text-subtle">सेटिंग्स</p>
        <p className="mt-1 text-sm text-sx-text-muted">Workspace identity and account security.</p>
      </div>

      {/* Profile & Login */}
      <Card className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Profile & Login</p>
        <div className="mt-3 flex flex-col gap-3">
          <SettingsRow label="Business name" value={active?.name || "—"} />
          <SettingsRow label="Workspace" value={active?.slug || "—"} />
          <SettingsRow label="Email" value={emailLabel} />
          <SettingsRow label="Role in this workspace" value={active?.role ?? "Staff support"} valueClassName="capitalize" />
          <div className="flex items-center justify-between">
            <span className="text-[14px] text-sx-text-muted">Password</span>
            <Link href="/forgot-password" className="text-[14px] font-semibold text-sx-accent hover:underline">
              Reset password
            </Link>
          </div>
        </div>
      </Card>

      {/* Appearance */}
      <Card className="p-5">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Appearance</p>
        <div className="flex rounded-sx-sm bg-sx-surface-2 p-[3px]">
          {(["light", "dark"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={theme === option}
              onClick={() => setTheme(option)}
              className={`h-[38px] flex-1 rounded-sx-xs text-[14px] font-semibold capitalize transition-colors ${
                theme === option ? "bg-sx-accent text-sx-accent-on" : "text-sx-text-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </Card>

      {/* Support — real destinations */}
      <Card className="overflow-hidden p-0">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 border-b border-sx-border px-4 py-3.5 transition-colors hover:bg-sx-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" /></svg>
          <span className="text-[15px] font-semibold text-sx-text">WhatsApp Support</span>
          <span className="flex-1" />
          <span className="text-sx-text-subtle">›</span>
        </a>
        <Link
          href="/contact?intent=feedback"
          className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sx-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sx-text-subtle)" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
          <span className="text-[15px] font-semibold text-sx-text">Send Feedback</span>
          <span className="flex-1" />
          <span className="text-sx-text-subtle">›</span>
        </Link>
      </Card>
    </div>
  );
}

function SettingsRow({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-sx-text-muted">{label}</span>
      <span className={`truncate text-[14px] font-semibold text-sx-text ${valueClassName}`}>{value}</span>
    </div>
  );
}
