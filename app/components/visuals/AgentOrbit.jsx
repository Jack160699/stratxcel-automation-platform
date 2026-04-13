import { COLORS } from "@/lib/constants";

/** Agent interaction motif — human ↔ model ↔ tools. */
export function AgentOrbit({ className = "" }) {
  const { brand, accent } = COLORS;
  return (
    <svg
      className={className}
      viewBox="0 0 400 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <ellipse cx="200" cy="110" rx="150" ry="72" stroke={brand} strokeOpacity="0.2" strokeWidth="1" />
      <ellipse cx="200" cy="110" rx="98" ry="48" stroke={accent} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 6" />
      <line x1="70" y1="110" x2="150" y2="110" stroke={accent} strokeOpacity="0.5" strokeWidth="1.5" />
      <line x1="250" y1="110" x2="330" y2="110" stroke={accent} strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="70" cy="110" r="22" fill="white" stroke={brand} strokeOpacity="0.25" />
      <text x="70" y="114" textAnchor="middle" fill="#0B1220" fontSize="10" fontWeight="600" fontFamily="var(--font-geist-sans), system-ui">
        Human
      </text>
      <circle cx="200" cy="110" r="36" fill="url(#ag-core)" />
      <defs>
        <radialGradient id="ag-core" cx="40%" cy="35%">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={brand} />
        </radialGradient>
      </defs>
      <text x="200" y="114" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="var(--font-geist-sans), system-ui">
        Agent
      </text>
      <circle cx="330" cy="110" r="22" fill="white" stroke={accent} strokeOpacity="0.35" />
      <text x="330" y="110" textAnchor="middle" fill="#0B1220" fontSize="9" fontWeight="600" fontFamily="var(--font-geist-sans), system-ui">
        Module
      </text>
      <text x="330" y="122" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="var(--font-geist-sans), system-ui">
        + APIs
      </text>
    </svg>
  );
}
