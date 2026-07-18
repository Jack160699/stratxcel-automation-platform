"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Mark } from "@/app/components/Mark";

export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (authError) {
      setError("Invalid credentials.");
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070e] px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7">
        <div className="flex items-center gap-3">
          <Mark className="h-8 w-8" />
          <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
            STRATXCEL
          </span>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-white">
          Admin console
        </h1>
        <p className="mt-2 text-sm text-slate-400">Internal access only.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="sr-only">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#45c4ff]/60"
            />
          </label>
          <label className="block">
            <span className="sr-only">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              className="h-11 w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#45c4ff]/60"
            />
          </label>
          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="h-11 w-full rounded-xl bg-gradient-to-r from-[#45c4ff] to-[#1e3a8a] text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Open console"}
          </button>
        </form>
      </div>
    </main>
  );
}
