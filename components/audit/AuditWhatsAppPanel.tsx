"use client";

import { PlatformIcon } from "@/components/audit/PlatformIcon";
import { WhatsAppDestinationField } from "@/components/audit/WhatsAppDestinationField";

export function AuditWhatsAppPanel({
  masked,
  consent,
  sending,
  sent,
  statusMessage,
  countryIso,
  nationalNumber,
  draftConsent,
  onCountry,
  onNational,
  onConsent,
  onSend,
  onChangeDestination,
}: {
  masked: string | null;
  consent: boolean;
  sending: boolean;
  sent: boolean;
  statusMessage?: string | null;
  countryIso: string;
  nationalNumber: string;
  draftConsent: boolean;
  onCountry: (iso: string) => void;
  onNational: (value: string) => void;
  onConsent: (value: boolean) => void;
  onSend: () => void;
  onChangeDestination: () => void;
}) {
  if (sent) {
    return (
      <div className="flex items-center gap-3 rounded-sx-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <span aria-hidden="true" className="text-lg">✓</span>
        Sent to WhatsApp
      </div>
    );
  }

  if (masked && !nationalNumber) {
    return (
      <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
        <header className="flex items-center gap-2">
          <PlatformIcon name="whatsapp" />
          <h2 className="font-sx-sans text-sm font-semibold">WhatsApp</h2>
        </header>
        <p className="mt-2 font-sx-mono text-sm text-sx-text">{masked}</p>
        <p className="mt-1 text-xs text-sx-text-subtle">{consent ? "Delivery permission enabled" : "Delivery permission off"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={sending}
            onClick={onSend}
            className="min-h-11 rounded-sx-sm bg-sx-accent px-4 text-sm font-semibold text-sx-accent-on disabled:opacity-60"
          >
            {sending ? "Sending your Audit…" : "Send Audit"}
          </button>
          <button type="button" onClick={onChangeDestination} className="min-h-11 rounded-sx-sm border border-sx-border px-4 text-sm">
            Change
          </button>
        </div>
        {statusMessage && <p className="mt-2 text-xs text-sx-text-subtle">{statusMessage}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-4">
      <header className="mb-3 flex items-center gap-2">
        <PlatformIcon name="whatsapp" />
        <h2 className="font-sx-sans text-sm font-semibold">Send your Audit on WhatsApp</h2>
      </header>
      <WhatsAppDestinationField
        countryIso={countryIso}
        nationalNumber={nationalNumber}
        consent={draftConsent}
        compact
        onCountry={onCountry}
        onNational={onNational}
        onConsent={onConsent}
      />
      <button
        type="button"
        disabled={sending}
        onClick={onSend}
        className="mt-4 min-h-11 w-full rounded-sx-sm bg-sx-accent px-4 text-sm font-semibold text-sx-accent-on disabled:opacity-60"
      >
        {sending ? "Sending your Audit…" : "Save & send Audit"}
      </button>
      {statusMessage && <p className="mt-2 text-xs text-sx-text-subtle">{statusMessage}</p>}
    </div>
  );
}
