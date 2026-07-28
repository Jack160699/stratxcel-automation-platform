export type ActivityActor = "USER" | "AGENT" | "SYSTEM";

function ActorIcon({ actor }: { actor: ActivityActor }) {
  const color = actor === "AGENT" ? "var(--saut-ai)" : actor === "SYSTEM" ? "var(--saut-text-subtle)" : "var(--saut-accent)";
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--saut-surface-2)" }}>
      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        {actor === "AGENT" ? (
          <>
            <rect x="4" y="6" width="12" height="9" rx="2.5" stroke={color} strokeWidth="1.6" />
            <path d="M10 6V3.5M7 10h.01M13 10h.01" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : actor === "SYSTEM" ? (
          <path
            d="M10 4v2M10 14v2M4 10h2M14 10h2M6.1 6.1l1.4 1.4M12.5 12.5l1.4 1.4M6.1 13.9l1.4-1.4M12.5 7.5l1.4-1.4"
            stroke={color}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ) : (
          <>
            <circle cx="10" cy="7" r="2.4" stroke={color} strokeWidth="1.6" />
            <path d="M4.5 16c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
}

/** One row in the Live Activity operational timeline — real audit events only, never fabricated. */
export function ActivityItem({ createdAt, actor, title }: { createdAt: string; actor: ActivityActor; title: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <ActorIcon actor={actor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" style={{ color: "var(--saut-text)" }}>
          {title}
        </p>
        <p className="saut-mono mt-0.5 text-[10.5px]" style={{ color: "var(--saut-text-subtle)" }}>
          {fmtTime(createdAt)} · {actor.toLowerCase()}
        </p>
      </div>
    </div>
  );
}
