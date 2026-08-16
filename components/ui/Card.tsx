import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "panel" | "nested" | "elevated" | "ai" | "alert";

const VARIANT_CLASSES: Record<CardVariant, string> = {
  panel: "bg-sx-surface-1 border border-sx-border",
  nested: "bg-sx-surface-2 border border-sx-border",
  elevated: "bg-sx-elevated border border-sx-border-strong shadow-[var(--sx-shadow-lg)]",
  ai: "bg-gradient-to-br from-[rgb(79_220_229_/_0.08)] via-[rgb(58_160_255_/_0.02)] to-transparent bg-sx-surface-1 border border-[rgb(79_220_229_/_0.24)] relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sx-ai before:to-transparent before:opacity-70",
  alert: "bg-sx-surface-1 border border-[rgb(242_86_95_/_0.35)] shadow-[inset_3px_0_0_var(--sx-danger)]",
};

/** Stratxcel Core panel/card — docs/product-design/DESIGN_SOURCE_AUDIT.md §2.6. */
export function Card({
  variant = "panel",
  className = "",
  children,
  ...rest
}: { variant?: CardVariant; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role={variant === "alert" ? "alert" : undefined}
      className={`rounded-sx-md p-4 sm:p-5 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`font-sx-sans text-base font-semibold text-sx-text sm:text-sm ${className}`}>{children}</h3>;
}

/** One row inside a Card's list content — top-border-separated, matches the artifact's .panel-row / .mission-row. */
export function CardRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-2.5 border-t border-sx-border py-3 text-sm first:border-t-0 first:pt-0 sm:py-2.5 sm:text-[12.5px] ${className}`}>
      {children}
    </div>
  );
}
