import { COLORS } from "@/lib/constants";

/** Abstract mesh — ingress, orchestration, execution, observability. */
export function ArchitectureMesh({ className = "" }) {
  const { brand, accent, ink } = COLORS;
  return (
    <svg
      className={className}
      viewBox="0 0 560 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="sx-edge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.15" />
          <stop offset="50%" stopColor={accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={brand} stopOpacity="0.35" />
        </linearGradient>
        <filter id="sx-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d="M40 140 H120 Q140 140 150 120 L200 70 Q210 55 230 60 L320 88 Q340 94 360 78 L440 40 Q460 28 480 44 L520 72"
        stroke="url(#sx-edge)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 10"
        className="sx-dash-animate"
      />
      <path
        d="M52 190 L130 175 Q150 170 168 188 L248 232 Q268 248 292 236 L380 198 Q402 186 424 200 L508 244"
        stroke={brand}
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M180 210 L240 160 L310 200 L400 150 L470 190"
        stroke={accent}
        strokeOpacity="0.4"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeDasharray="4 8"
      />
      {[
        { cx: 52, cy: 190, r: 10 },
        { cx: 230, cy: 60, r: 11 },
        { cx: 360, cy: 78, r: 10 },
        { cx: 508, cy: 244, r: 9 },
        { cx: 310, cy: 200, r: 12 },
        { cx: 400, cy: 150, r: 9 },
      ].map((c, i) => (
        <circle
          key={i}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={i % 2 === 0 ? accent : brand}
          fillOpacity={0.9}
          filter={i === 2 ? "url(#sx-glow)" : undefined}
        />
      ))}
      <rect x="24" y="118" width="72" height="44" rx="12" fill="white" fillOpacity="0.92" stroke={ink} strokeOpacity="0.08" />
      <text x="60" y="146" textAnchor="middle" fill={ink} fontSize="11" fontWeight="600" fontFamily="var(--font-geist-sans), system-ui">
        Ingest
      </text>
      <rect x="248" y="32" width="88" height="48" rx="14" fill="white" fillOpacity="0.95" stroke={accent} strokeOpacity="0.35" />
      <text x="292" y="60" textAnchor="middle" fill={ink} fontSize="11" fontWeight="600" fontFamily="var(--font-geist-sans), system-ui">
        Orchestrate
      </text>
      <rect x="392" y="118" width="96" height="46" rx="14" fill="white" fillOpacity="0.92" stroke={brand} strokeOpacity="0.3" />
      <text x="440" y="146" textAnchor="middle" fill={ink} fontSize="11" fontWeight="600" fontFamily="var(--font-geist-sans), system-ui">
        Execute
      </text>
      <rect x="168" y="188" width="100" height="44" rx="12" fill="#0B1220" fillOpacity="0.92" />
      <text x="218" y="216" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="600" fontFamily="var(--font-geist-sans), system-ui">
        Observe
      </text>
    </svg>
  );
}
