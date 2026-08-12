"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
import { Logo } from "./Logo";

const PRIMARY_LINKS = [
  { label: "What Stratxcel does", href: "/modules" },
  { label: "Solutions", href: "/solutions" },
  { label: "Integrations", href: "/integrations" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Security", href: "/security" },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const closeButton = dialog?.querySelector<HTMLElement>('button[aria-label="Close menu"]');
    closeButton?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); requestAnimationFrame(() => menuButtonRef.current?.focus()); } };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  const closeMenu = () => { setOpen(false); requestAnimationFrame(() => menuButtonRef.current?.focus()); };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-sx-border bg-sx-bg/90 shadow-sm backdrop-blur-lg" aria-hidden={open || undefined} inert={open || undefined}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo variant="dark" priority />
          <nav className="hidden items-center gap-6 lg:flex" aria-label="Primary">
            {PRIMARY_LINKS.map((link) => (<Link key={link.href} href={link.href} className="text-[13px] font-semibold text-sx-text-muted hover:text-sx-accent">{link.label}</Link>))}
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <Link href={PUBLIC_CTAS.signIn.href} className="px-3 py-2 text-[13px] font-medium text-sx-text-subtle hover:text-sx-text">{PUBLIC_CTAS.signIn.label}</Link>
            <TrackedCtaLink href={PUBLIC_CTAS.explorePlatform.href} event={PUBLIC_CTAS.explorePlatform.event} surface="public_header_secondary" className="rounded-sx-sm border border-sx-border-strong px-4 py-2 text-[13px] font-semibold hover:bg-sx-surface-2">{PUBLIC_CTAS.explorePlatform.label}</TrackedCtaLink>
            <TrackedCtaLink href={PUBLIC_CTAS.primary.href} event={PUBLIC_CTAS.primary.event} surface={PUBLIC_CTAS.primary.surface} className="rounded-sx-sm bg-sx-accent px-5 py-2.5 text-[13px] font-bold text-sx-accent-on shadow-md">{PUBLIC_CTAS.primary.label}</TrackedCtaLink>
          </div>
          <button ref={menuButtonRef} type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-sx-sm border border-sx-border-strong md:hidden" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => (open ? closeMenu() : setOpen(true))}>×</button>
        </div>
      </header>
      {open && (
        <div ref={dialogRef} className="fixed inset-0 z-[60] flex flex-col bg-sx-bg md:hidden" role="dialog" aria-modal="true">
          <div className="flex h-16 items-center justify-between border-b px-4"><Logo variant="dark" /><button type="button" aria-label="Close menu" onClick={closeMenu}>×</button></div>
          <nav className="flex flex-1 flex-col gap-2 p-4">
            {PRIMARY_LINKS.map((link) => (<Link key={link.href} href={link.href} onClick={closeMenu} className="rounded-sx-sm border border-sx-border p-3.5 text-sm font-semibold">{link.label}</Link>))}
          </nav>
          <div className="flex flex-col gap-3 border-t p-4">
            <Link href={PUBLIC_CTAS.signIn.href} onClick={closeMenu} className="rounded-sx-sm border px-4 py-3 text-center text-sm">{PUBLIC_CTAS.signIn.label}</Link>
            <TrackedCtaLink href={PUBLIC_CTAS.explorePlatform.href} event={PUBLIC_CTAS.explorePlatform.event} surface="public_header_mobile" onClick={closeMenu} className="rounded-sx-sm border px-4 py-3 text-center text-sm font-semibold">{PUBLIC_CTAS.explorePlatform.label}</TrackedCtaLink>
            <TrackedCtaLink href={PUBLIC_CTAS.primary.href} event={PUBLIC_CTAS.primary.event} surface="public_header_mobile" onClick={closeMenu} className="rounded-sx-sm bg-sx-accent px-4 py-3 text-center text-sm font-bold text-sx-accent-on">{PUBLIC_CTAS.primary.label}</TrackedCtaLink>
          </div>
        </div>
      )}
    </>
  );
}
