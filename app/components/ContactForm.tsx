"use client";

import { useActionState } from "react";
import {
  submitContact,
  type ContactFormState,
} from "@/app/actions/contact";

const initialState: ContactFormState = { status: "idle", message: "" };

const tones = {
  dark: {
    input:
      "w-full rounded-lg border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition-colors focus:border-[#45c4ff]/60",
    button:
      "h-11 w-full rounded-lg bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50",
    ok: "text-emerald-300",
    err: "text-rose-300",
  },
  light: {
    input:
      "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition-colors focus:border-blue-500",
    button:
      "h-11 w-full rounded-lg bg-gradient-to-r from-blue-500 to-blue-800 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50",
    ok: "text-emerald-600",
    err: "text-rose-600",
  },
};

export function ContactForm({
  source,
  tone = "dark",
}: {
  source: string;
  tone?: keyof typeof tones;
}) {
  const [state, action, pending] = useActionState(submitContact, initialState);
  const t = tones[tone];

  if (state.status === "success") {
    return (
      <p role="status" className={`py-6 text-sm ${t.ok}`}>
        ✓ {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="source" value={source} />
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="sr-only">Your name</span>
          <input name="name" required minLength={2} maxLength={200} placeholder="Name" className={t.input} />
        </label>
        <label className="block">
          <span className="sr-only">Email address</span>
          <input name="email" type="email" required maxLength={320} placeholder="Email" className={t.input} />
        </label>
      </div>
      <label className="block">
        <span className="sr-only">Company (optional)</span>
        <input name="company" maxLength={200} placeholder="Company (optional)" className={t.input} />
      </label>
      <label className="block">
        <span className="sr-only">What should we build?</span>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={5000}
          rows={4}
          placeholder="What should we build?"
          className={`${t.input} resize-none`}
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className={`text-xs ${t.err}`}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className={t.button}>
        {pending ? "Transmitting…" : "Send transmission"}
      </button>
    </form>
  );
}
