import { COLORS } from "@/lib/constants";

/** Horizontal pipeline — stages connected by a shared spine. */
export function PipelineRail({ stages, className = "" }) {
  const { brand, accent } = COLORS;
  return (
    <div className={`relative px-1 py-6 sm:px-0 ${className}`}>
      <div
        className="pointer-events-none absolute left-[8%] right-[8%] top-[calc(1.5rem+10px)] hidden h-px sm:block"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}55, ${brand}44, ${accent}55, transparent)`,
        }}
        aria-hidden
      />
      <div className="relative flex flex-col gap-8 sm:flex-row sm:justify-between sm:gap-4">
        {stages.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center text-center">
            <span
              className="relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border shadow-sm sm:h-[22px] sm:w-[22px]"
              style={{
                borderColor: `${accent}55`,
                background: `linear-gradient(145deg, ${accent}, ${brand})`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/95" />
            </span>
            <p className="mt-4 max-w-[11rem] text-[12px] font-medium leading-snug text-slate-600 sm:text-[13px]">
              <span className="mr-1.5 font-mono text-[10px] text-slate-400">{String(i + 1).padStart(2, "0")}</span>
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
