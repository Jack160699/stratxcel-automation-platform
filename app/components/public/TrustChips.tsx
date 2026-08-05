/** Compact trust-point row on Core tokens — dark-theme counterpart of the old TrustChips. */
export function TrustChips({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul className={`flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-7 sm:gap-y-2 ${className}`.trim()}>
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2 font-sx-sans text-[12.5px] leading-snug text-sx-text-muted">
          <span
            aria-hidden
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sx-accent-muted text-[9px] font-bold text-sx-accent"
          >
            ✓
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
