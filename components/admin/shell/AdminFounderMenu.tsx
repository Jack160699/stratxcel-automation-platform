"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/admin/actions";
import { User, LogOut, ShieldCheck, ChevronDown, ExternalLink } from "lucide-react";

export function AdminFounderMenu({
  email,
  role = "Platform Founder",
}: {
  email: string;
  role?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Derive display initials or short name
  const displayLabel = "Founder Admin";

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Founder Account Menu"
        className="flex h-8 items-center gap-2 rounded-lg border border-sx-border/80 bg-sx-surface-2 px-2.5 text-xs font-medium text-sx-text transition-colors hover:border-sx-border-strong hover:bg-sx-surface-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent"
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4FDCE5] to-[#4F75E5] text-[10px] font-bold text-black">
          F
        </div>
        <span className="hidden truncate text-[12px] font-medium sm:inline">{displayLabel}</span>
        <ChevronDown size={13} className={`text-sx-text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-[var(--sx-z-dropdown,70)] mt-2 w-64 origin-top-right rounded-xl border border-sx-border/80 bg-sx-elevated p-2 shadow-xl backdrop-blur-md">
          {/* Identity Header */}
          <div className="rounded-lg border border-sx-border/40 bg-sx-surface-2/60 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-sx-accent" />
              <span className="font-sx-mono text-[10px] uppercase tracking-wider text-sx-text-muted">
                {role}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-sx-text" title={email}>
              {email || "founder@stratxcel.in"}
            </p>
          </div>

          <div className="my-1.5 border-t border-sx-border/40" />

          {/* Quick Links */}
          <div className="flex flex-col gap-0.5">
            <Link
              href="/app"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-sx-text-muted transition-colors hover:bg-sx-surface-2 hover:text-sx-text"
            >
              <span className="flex items-center gap-2">
                <ExternalLink size={13} />
                <span>Switch to Customer App</span>
              </span>
              <span className="font-sx-mono text-[9px] text-sx-text-subtle">/app</span>
            </Link>

            <Link
              href="/admin/system"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-sx-text-muted transition-colors hover:bg-sx-surface-2 hover:text-sx-text"
            >
              <span className="flex items-center gap-2">
                <User size={13} />
                <span>System Center</span>
              </span>
            </Link>
          </div>

          <div className="my-1.5 border-t border-sx-border/40" />

          {/* Sign Out Action */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut size={13} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
