import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "default" | "lg" | "touch" | "cta";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-sx-accent text-sx-accent-on font-semibold hover:bg-[color:var(--sx-accent-hover)]",
  secondary: "bg-sx-surface-3 border border-sx-border-strong text-sx-text hover:bg-sx-elevated",
  ghost: "bg-transparent text-sx-text-muted hover:bg-sx-surface-2 hover:text-sx-text",
  danger: "bg-[rgb(242_86_95_/_0.1)] border border-[rgb(242_86_95_/_0.4)] text-[#FF8A90] hover:bg-[rgb(242_86_95_/_0.18)]",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[11.5px]",
  default: "h-8 px-3.5 text-[12.5px]",
  lg: "h-9 px-4 text-[13.5px]",
  /** ~44px min touch target — mobile-first flows (e.g. onboarding) that need real tap targets, not the desktop-dense default. */
  touch: "h-11 px-4 text-[13.5px]",
  /** Customer app primary-action size — 52px mobile / 44px desktop, spec §5.1. */
  cta: "h-13 md:h-11 px-5 text-[15px] font-semibold",
};

/**
 * Stratxcel Core button — see docs/product-design/COMPONENT_INVENTORY.md.
 * Icon-only usage: pass a single icon child and set aria-label; callers are
 * responsible for wrapping with Tooltip in collapsed-sidebar contexts.
 */
export function Button({
  variant = "secondary",
  size = "default",
  className = "",
  children,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-sx-sm border border-transparent font-sx-sans transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className = "",
  children,
  ...rest
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-sx-sm border border-sx-border-strong bg-sx-surface-3 text-sx-text-muted transition-colors duration-150 ease-out hover:bg-sx-elevated hover:text-sx-text disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
