import { COLORS } from "@/lib/constants";

const { ink } = COLORS;

export function PageHero({ eyebrow, title, description, children }) {
  return (
    <header className="border-b border-slate-200/50 bg-gradient-to-b from-white/80 to-[#F8FAFC]/90">
      <div className="mx-auto max-w-6xl px-4 pb-11 pt-9 sm:px-6 sm:pb-14 sm:pt-12 lg:px-8 lg:pb-[4.5rem] lg:pt-14">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400/95 sm:text-[11px] sm:tracking-[0.2em]">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="mt-2.5 max-w-3xl text-pretty text-[1.65rem] font-semibold leading-[1.06] tracking-[-0.038em] sm:mt-3.5 sm:text-[2.1rem] sm:leading-[1.05] sm:tracking-[-0.04em] lg:text-[2.5rem] lg:leading-[1.04] xl:text-[2.65rem]"
          style={{ color: ink }}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-3.5 max-w-2xl text-pretty text-[15px] leading-[1.55] tracking-[-0.011em] text-slate-600 sm:mt-4 sm:text-[17px] sm:leading-[1.58]">
            {description}
          </p>
        ) : null}
        {children ? (
          <div className="mt-7 min-w-0 max-w-full overflow-x-auto sm:mt-9 lg:mt-11">{children}</div>
        ) : null}
      </div>
    </header>
  );
}
