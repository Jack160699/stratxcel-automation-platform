/** Consistent "nothing here" treatment — a quiet checkmark instead of empty whitespace. */
export function EmptyState({ children, hint }: { children: string; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-sm" style={{ color: "var(--saut-text-subtle)" }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="10" r="8.5" stroke="var(--saut-success)" strokeWidth="1.4" />
          <path d="M6.5 10.2l2.3 2.3 4.7-5" stroke="var(--saut-success)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {children}
      </p>
      {hint && (
        <p className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
