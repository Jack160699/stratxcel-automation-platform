"use client";

import type { ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  badge?: number | string;
  icon?: ReactNode;
}

export function AdminSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  disabled = false,
}: {
  options: readonly SegmentedOption<T>[] | SegmentedOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
}) {
  const sizeClasses = {
    xs: "p-0.5 text-[11px] h-7",
    sm: "p-0.5 text-xs h-8",
    md: "p-1 text-xs h-9",
  }[size];

  const itemPadding = {
    xs: "px-2.5 py-1",
    sm: "px-3 py-1",
    md: "px-3.5 py-1.5",
  }[size];

  return (
    <div
      role="radiogroup"
      className={`inline-flex items-center rounded-lg border border-sx-border/80 bg-sx-surface-2 text-sx-text-muted ${sizeClasses}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 rounded-md font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sx-accent ${itemPadding} ${
              active
                ? "bg-sx-surface-1 text-sx-text shadow-sm"
                : "text-sx-text-subtle hover:text-sx-text hover:bg-sx-surface-1/40"
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge != null && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-sx-mono ${
                  active ? "bg-sx-accent/15 text-sx-accent" : "bg-sx-surface-1 text-sx-text-subtle"
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
