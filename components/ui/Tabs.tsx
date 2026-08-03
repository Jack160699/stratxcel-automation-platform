"use client";

import { useState, type ReactNode } from "react";

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
}

/** Underline tabs — 2px accent bottom-inset on the active tab (DESIGN_SOURCE_AUDIT.md §2.9). */
export function Tabs({ items, defaultKey }: { items: TabItem[]; defaultKey?: string }) {
  const [active, setActive] = useState(defaultKey ?? items[0]?.key);
  const activeItem = items.find((i) => i.key === active);
  return (
    <div>
      <div role="tablist" className="flex gap-5 border-b border-sx-border">
        {items.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={item.key === active}
            onClick={() => setActive(item.key)}
            className={`pb-2.5 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent ${
              item.key === active ? "text-sx-text shadow-[inset_0_-2px_0_var(--sx-accent)]" : "text-sx-text-muted hover:text-sx-text"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        {activeItem?.content}
      </div>
    </div>
  );
}

/** Segmented control — e.g. density toggle. */
export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          aria-pressed={o.key === value}
          className={`h-[26px] rounded-[6px] px-3 text-[12.5px] transition-colors duration-150 ${
            o.key === value ? "bg-sx-elevated text-sx-text" : "text-sx-text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
