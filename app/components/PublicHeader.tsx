"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TrackedCtaLink } from "@/app/components/public/commercial/TrackedCtaLink";
import { ProductMegaMenu, MobileProductsAccordion } from "@/app/components/public/product-suite/ProductMegaMenu";
import { PUBLIC_CTAS } from "@/lib/commercial/ctas";
import { Logo } from "./Logo";

const PRIMARY_LINKS: { label: string; href: string }[] = [
  { label: "Solutions", href: "/solutions" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    const closeButton = dialog?.querySelector<HTMLElement>('button[aria-label="Close menu"]');

    document.body.style.overflow = "hidden";
    closeButton?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }

      if (event.key !== "Tab" || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-sx-border bg-sx-bg/90 shadow-sm backdrop-blur-lg"
        aria-hidden={open || undefined}
        inert={open || undefined}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo variant="dark" priority />

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            <ProductMegaMenu />
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href={PUBLIC_CTAS.signIn.href}
              className="rounded-sx-sm px-3 py-2.5 text-[13px] font-medium text-sx-text-subtle transition-colors hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {PUBLIC_CTAS.signIn.label}
            </Link>
            <TrackedCtaLink
              href={PUBLIC_CTAS.primary.href}
              event={PUBLIC_CTAS.primary.event}
              surface={PUBLIC_CTAS.primary.surface}
              className="rounded-sx-sm bg-sx-accent px-5 py-2.5 text-[13px] font-bold text-sx-accent-on shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            >
              {PUBLIC_CTAS.primary.label}
            </TrackedCtaLink>
          </div>

          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-sx-sm border border-sx-border-strong lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => (open ? closeMenu() : setOpen(true))}
          >
            {open ? (
              <span className="text-xl leading-none">×</span>
            ) : (
              <span className="flex flex-col gap-1" aria-hidden>
                <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
                <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
                <span className="block h-0.5 w-4 rounded-full bg-sx-text" />
              </span>
            )}
          </button>
        </div>
      </header>

      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-[60] flex flex-col bg-sx-bg lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
        >
          <div className="flex h-16 items-center justify-between border-b border-sx-border px-4 sm:px-6">
            <Logo variant="dark" />
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-sx-sm border border-sx-border-strong text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-6" aria-label="Mobile Navigation">
            <MobileProductsAccordion onNavigate={closeMenu} />
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="rounded-sx-sm border border-sx-border p-4 font-sx-sans text-sm font-semibold text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-3 border-t border-sx-border p-4 sm:p-6">
            <Link
              href={PUBLIC_CTAS.signIn.href}
              onClick={closeMenu}
              className="rounded-sx-sm border border-sx-border-strong px-4 py-3 text-center text-sm font-semibold"
            >
              {PUBLIC_CTAS.signIn.label}
            </Link>
            <TrackedCtaLink
              href={PUBLIC_CTAS.primary.href}
              event={PUBLIC_CTAS.primary.event}
              surface="public_header_mobile"
              onClick={closeMenu}
              className="rounded-sx-sm bg-sx-accent px-4 py-3 text-center text-sm font-bold text-sx-accent-on"
            >
              {PUBLIC_CTAS.primary.label}
            </TrackedCtaLink>
          </div>
        </div>
      )}
    </>
  );
}
