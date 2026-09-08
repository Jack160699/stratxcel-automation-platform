"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function AdminPageHeader({
  breadcrumb,
  title,
  description,
  actions,
  badge,
}: {
  breadcrumb?: BreadcrumbItem[] | string;
  title: string;
  description?: string | ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1 min-w-0">
        {breadcrumb && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px] font-medium text-sx-text-subtle">
            {typeof breadcrumb === "string" ? (
              <span className="truncate">{breadcrumb}</span>
            ) : (
              breadcrumb.map((item, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5">
                  {idx > 0 && <ChevronRight size={12} className="shrink-0 text-sx-border-strong" />}
                  {item.href ? (
                    <Link href={item.href} className="transition-colors hover:text-sx-text">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-sx-text-muted">{item.label}</span>
                  )}
                </span>
              ))
            )}
          </nav>
        )}
        <div className="flex items-center gap-2.5">
          <h1 className="font-sx-sans text-xl sm:text-2xl font-semibold tracking-tight text-sx-text truncate">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="text-[13px] text-sx-text-muted leading-relaxed line-clamp-2 max-w-3xl">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">{actions}</div>}
    </header>
  );
}
