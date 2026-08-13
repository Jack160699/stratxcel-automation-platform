import { LOCAL_BUSINESS_JOURNEY_STAGES } from "@/lib/solutions/journey-model";
import type { LocalBusinessVerticalJourneyStep } from "@/lib/solutions/local-business-verticals";

type BusinessJourneyVisualProps = {
  steps?: readonly LocalBusinessVerticalJourneyStep[];
  className?: string;
};

export function BusinessJourneyVisual({ steps, className = "" }: BusinessJourneyVisualProps) {
  const items = LOCAL_BUSINESS_JOURNEY_STAGES.map((stage, index) => {
    const focus = steps?.[index]?.focus;
    return { ...stage, focus };
  });

  return (
    <div className={`relative ${className}`.trim()} aria-label="Customer journey">
      <div className="pointer-events-none absolute left-6 right-6 top-8 hidden h-px bg-gradient-to-r from-transparent via-sx-border-strong to-transparent sm:block" aria-hidden />
      <ol className="grid gap-4 sm:grid-cols-5 sm:gap-3">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="relative rounded-sx-md border border-sx-border bg-sx-surface-1 p-4"
          >
            <p className="font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sx-accent">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-2 font-sx-sans text-sm font-semibold text-sx-text">{item.title}</h3>
            <p className="mt-1 text-[11px] font-medium text-sx-text-muted">{item.subtitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-sx-text-muted">{item.focus ?? item.description}</p>
            {index < items.length - 1 && (
              <span
                className="absolute -right-2 top-1/2 hidden -translate-y-1/2 font-sx-mono text-sx-text-subtle sm:inline"
                aria-hidden
              >
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
