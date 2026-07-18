/** The Stratxcel mark — an engineered X inside a halo. */
export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 10 L38 38 M38 10 L10 38"
        stroke="url(#sxg)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="21" stroke="rgba(69,196,255,0.35)" strokeWidth="1.5" />
      <defs>
        <linearGradient id="sxg" x1="10" y1="10" x2="38" y2="38">
          <stop stopColor="#45C4FF" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
