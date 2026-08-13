import Link from "next/link";
import { CUSTOMER_OUTCOME_GROUPS } from "@/lib/product-suite/customer-language";

export function CustomerOutcomePills({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      {CUSTOMER_OUTCOME_GROUPS.map((group) => (
        <a
          key={group.id}
          href={`#${group.id}`}
          className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text"
        >
          {group.label}
        </a>
      ))}
      <Link
        href="/pricing"
        className="rounded-sx-pill border border-sx-border bg-sx-surface-1 px-3 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text-muted transition-colors hover:border-sx-border-strong hover:text-sx-text"
      >
        View pricing
      </Link>
    </div>
  );
}
