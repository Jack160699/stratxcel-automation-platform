/**
 * The calm health-score ring — StratXcel App Design Spec §5.9 / §2.3.
 * A single hero number in a soft tint of its band colour, never a
 * traffic-light fill. Used on Home and Audit.
 */
const CIRCUMFERENCE = 2 * Math.PI * 55;

export type ScoreBand = "strong" | "good" | "needs-work" | "at-risk";

export function bandForScore(score: number): ScoreBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "good";
  if (score >= 40) return "needs-work";
  return "at-risk";
}

const BAND_COPY: Record<ScoreBand, { label: string; labelHi: string; ring: string; text: string; tint: string }> = {
  strong: { label: "Strong", labelHi: "मज़बूत", ring: "#16A34A", text: "#0A7A0A", tint: "#E7F6E7" },
  good: { label: "Good", labelHi: "अच्छा", ring: "#1B5FE3", text: "#1650C4", tint: "#EAF0FE" },
  "needs-work": { label: "Needs work", labelHi: "सुधार चाहिए", ring: "#D97706", text: "#8A6100", tint: "#FDF3DD" },
  "at-risk": { label: "At risk", labelHi: "जोखिम में", ring: "#DC2626", text: "#B42020", tint: "#F9E6E6" },
};

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = bandForScore(clamped);
  const copy = BAND_COPY[band];
  const filled = (clamped / 100) * CIRCUMFERENCE;
  const remainder = CIRCUMFERENCE - filled;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r="55" fill="none" stroke="var(--sx-surface-2)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r="55"
          fill="none"
          stroke={copy.ring}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${remainder}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[32px] font-semibold leading-[36px] text-sx-text">{Math.round(clamped)}</div>
        <div className="text-xs text-sx-text-subtle">/100</div>
      </div>
    </div>
  );
}

export function ScoreBandChip({ band }: { band: ScoreBand }) {
  const copy = BAND_COPY[band];
  return (
    <span
      className="inline-flex h-[26px] items-center gap-1.5 rounded-sx-pill px-2.5 text-[13px] font-semibold"
      style={{ background: copy.tint, color: copy.text }}
    >
      <CheckCircleIcon />
      {copy.label}
      <span className="sx-hi opacity-80">{copy.labelHi}</span>
    </span>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}
