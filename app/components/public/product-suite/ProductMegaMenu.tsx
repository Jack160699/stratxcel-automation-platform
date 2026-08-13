"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PRODUCT_GROUPS, getProductHref, PRODUCTS } from "@/lib/product-suite/taxonomy";
import { ProductStateBadge } from "./ProductStateBadge";

function DesktopMegaPanel({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="absolute left-0 top-full z-50 w-[min(100vw-2rem,72rem)] pt-3">
      <div className="rounded-sx-md border border-sx-border bg-sx-bg p-5 shadow-lg">
        <div className="grid gap-5 lg:grid-cols-5">
          {PRODUCT_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-accent">{group.label}</p>
              <ul className="mt-3 space-y-2">
                {group.productIds.map((id) => {
                  const product = PRODUCTS[id];
                  if (!product) return null;
                  const href = getProductHref(product);
                  const disabled = product.availability === "coming-later";
                  return (
                    <li key={id}>
                      {disabled ? (
                        <span className="block rounded-sx-sm px-2 py-1.5 font-sx-sans text-[13px] text-sx-text-subtle">
                          {product.name}
                        </span>
                      ) : (
                        <Link
                          href={href}
                          onClick={onNavigate}
                          className="block rounded-sx-sm px-2 py-1.5 font-sx-sans text-[13px] font-medium text-sx-text-muted transition-colors hover:bg-sx-surface-2 hover:text-sx-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
                        >
                          {product.name}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-sx-border pt-4">
          <p className="font-sx-sans text-[12px] text-sx-text-subtle">Connected capabilities inside one Stratxcel workspace.</p>
          <Link
            href="/products"
            onClick={onNavigate}
            className="font-sx-sans text-[12px] font-semibold text-sx-accent hover:text-[color:var(--sx-accent-hover)]"
          >
            View all products →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ProductMegaMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex items-center gap-1 font-sx-sans text-[14px] font-semibold text-sx-text-muted transition-colors hover:text-sx-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((value) => !value)}
      >
        Products
        <span aria-hidden className="text-[10px]">{open ? "▴" : "▾"}</span>
      </button>
      {open && <DesktopMegaPanel onNavigate={() => setOpen(false)} />}
    </div>
  );
}

export function MobileProductsAccordion({ onNavigate }: { onNavigate?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <div className="rounded-sx-sm border border-sx-border">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3.5 font-sx-sans text-sm font-semibold text-sx-text"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        Products
        <span aria-hidden>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="border-t border-sx-border px-3 pb-3">
          {PRODUCT_GROUPS.map((group) => {
            const isOpen = openGroup === group.id;
            return (
              <div key={group.id} className="border-b border-sx-border last:border-b-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-2.5 font-sx-sans text-[13px] font-semibold text-sx-text-muted"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroup(isOpen ? null : group.id)}
                >
                  {group.label}
                  <span aria-hidden>{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <ul className="space-y-1 pb-2">
                    {group.productIds.map((id) => {
                      const product = PRODUCTS[id];
                      if (!product) return null;
                      const href = getProductHref(product);
                      const disabled = product.availability === "coming-later";
                      return (
                        <li key={id}>
                          {disabled ? (
                            <div className="flex items-center justify-between rounded-sx-sm px-2 py-2">
                              <span className="font-sx-sans text-[12.5px] text-sx-text-subtle">{product.name}</span>
                              <ProductStateBadge availability={product.availability} />
                            </div>
                          ) : (
                            <Link
                              href={href}
                              onClick={onNavigate}
                              className="flex items-center justify-between rounded-sx-sm px-2 py-2 font-sx-sans text-[12.5px] font-medium text-sx-text transition-colors hover:bg-sx-surface-2"
                            >
                              <span>{product.name}</span>
                              <ProductStateBadge availability={product.availability} />
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
          <Link
            href="/products"
            onClick={onNavigate}
            className="mt-2 block rounded-sx-sm px-2 py-2 font-sx-sans text-[12.5px] font-semibold text-sx-accent"
          >
            View all products →
          </Link>
        </div>
      )}
    </div>
  );
}
