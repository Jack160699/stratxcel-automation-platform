"use client";

import { WHATSAPP_CALLING_COUNTRIES } from "@/lib/audit/v1/e164";

export function WhatsAppDestinationField({
  countryIso,
  nationalNumber,
  consent,
  onCountry,
  onNational,
  onConsent,
}: {
  countryIso: string;
  nationalNumber: string;
  consent: boolean;
  onCountry: (iso: string) => void;
  onNational: (value: string) => void;
  onConsent: (value: boolean) => void;
}) {
  return (
    <fieldset className="rounded-sx-sm border border-sx-border p-3">
      <legend className="px-1 text-sm font-medium text-sx-text">WhatsApp number</legend>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <label className="text-xs text-sx-text-muted sm:w-44">
          Country
          <select
            value={countryIso}
            onChange={(event) => onCountry(event.target.value)}
            className="mt-1 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-2 py-2 text-sm text-sx-text"
          >
            {WHATSAPP_CALLING_COUNTRIES.map((country) => (
              <option key={country.iso} value={country.iso}>
                {country.name} (+{country.dial})
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 text-xs text-sx-text-muted">
          Phone number
          <input
            inputMode="tel"
            autoComplete="tel-national"
            value={nationalNumber}
            onChange={(event) => onNational(event.target.value.replace(/[^0-9]/g, "").slice(0, 15))}
            placeholder="9876543210"
            className="mt-1 w-full rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-3 py-2 text-sm text-sx-text"
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-sx-text-subtle">We can send your completed Audit directly to this WhatsApp number.</p>
      <label className="mt-3 flex items-start gap-2 text-sm text-sx-text-muted">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onConsent(event.target.checked)}
          className="mt-1"
        />
        Send my completed Audit and Audit-related updates to this WhatsApp number.
      </label>
    </fieldset>
  );
}
