"use client";

import React from "react";
import { CATEGORY_FILTERS, type CategoryFilterId } from "./connector-meta";

export function ConnectorFilterBar({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  counts,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategory: CategoryFilterId;
  onCategoryChange: (category: CategoryFilterId) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Category Pills */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-0.5">
        {CATEGORY_FILTERS.map((cat) => {
          const isActive = activeCategory === cat.id;
          const count = counts?.[cat.id];

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onCategoryChange(cat.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 whitespace-nowrap ${
                isActive
                  ? "bg-sx-text text-sx-surface-0 shadow-sm"
                  : "bg-sx-surface-2 text-sx-text-muted hover:bg-sx-surface-3 hover:text-sx-text"
              }`}
            >
              <span>{cat.label}</span>
              {typeof count === "number" && count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                    isActive
                      ? "bg-sx-surface-0/20 text-sx-surface-0"
                      : "bg-sx-surface-3 text-sx-text-subtle"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search Field */}
      <div className="relative min-w-[200px] sm:w-64">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sx-text-subtle">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search connectors…"
          className="h-8 w-full rounded-lg border border-sx-border bg-sx-surface-1 pl-8 pr-7 text-xs text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none focus:ring-1 focus:ring-sx-accent/30"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-sx-text-subtle hover:text-sx-text"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
