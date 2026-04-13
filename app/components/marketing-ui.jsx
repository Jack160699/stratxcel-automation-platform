import Link from "next/link";
import { COLORS } from "@/lib/constants";

const { brand, accent } = COLORS;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC]";

const primaryCls =
  `inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[14px] font-semibold tracking-tight text-white shadow-[0_8px_28px_-10px_rgba(30,58,138,0.42)] transition-[transform,box-shadow,filter] duration-200 ease-out motion-safe:hover:-translate-y-px hover:brightness-[1.03] hover:shadow-[0_14px_38px_-12px_rgba(59,130,246,0.38)] active:translate-y-0 active:brightness-[0.98] sm:w-auto sm:px-7 ${focusRing}`;

const ghostLightCls =
  `inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full border border-slate-200/90 bg-white px-6 text-[14px] font-semibold tracking-tight text-[#0B1220] shadow-[0_3px_20px_-8px_rgba(11,18,32,0.08)] transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-slate-300/90 hover:bg-slate-50/90 hover:shadow-[0_10px_32px_-10px_rgba(11,18,32,0.12)] active:translate-y-0 sm:w-auto sm:px-7 ${focusRing}`;

const ghostDarkCls =
  `inline-flex h-11 min-h-[44px] w-full items-center justify-center rounded-full border border-white/25 bg-white/10 px-6 text-[14px] font-semibold tracking-tight text-white backdrop-blur-md transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out motion-safe:hover:-translate-y-px hover:border-white/40 hover:bg-white/16 hover:shadow-[0_12px_36px_-12px_rgba(59,130,246,0.22)] active:translate-y-0 sm:w-auto sm:px-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220]`;

export function PrimaryButton({ href, children, external, className = "" }) {
  const cls = [primaryCls, className].filter(Boolean).join(" ");
  const style = {
    background: `linear-gradient(135deg, ${accent} 0%, ${brand} 58%, ${brand} 100%)`,
  };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  );
}

/** tone="dark" for use on ink / gradient panels */
export function GhostButton({ href, children, external, tone = "light" }) {
  const cls = `${tone === "dark" ? ghostDarkCls : ghostLightCls}`.trim();
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return <Link href={href} className={cls}>{children}</Link>;
}

/** Consistent horizontal CTA layout — stacks on small screens, centers on larger. */
export function CTARow({ children, className = "" }) {
  return (
    <div
      className={`flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-3.5 md:gap-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** Muted reassurance under primary actions */
export function CTAMicrocopy({ children, dark = false, className = "" }) {
  return (
    <p
      className={`mt-3 w-full max-w-md text-center text-[12px] leading-[1.45] tracking-[-0.01em] sm:mx-auto sm:text-[13px] sm:leading-snug ${dark ? "text-slate-400" : "text-slate-500"} ${className}`.trim()}
    >
      {children}
    </p>
  );
}

/** Compact trust row — stacks on xs, inline on sm+ */
export function TrustChips({ items, className = "" }) {
  return (
    <ul
      className={`mx-auto flex max-w-lg flex-col gap-2.5 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-7 sm:gap-y-2 md:gap-x-8 ${className}`.trim()}
    >
      {items.map((t) => (
        <li
          key={t}
          className="flex items-center gap-2 text-left text-[12px] leading-[1.45] text-slate-600 sm:text-[13px] sm:leading-snug"
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-[0_1px_4px_-1px_rgba(30,58,138,0.35)]"
            style={{ background: `linear-gradient(145deg, ${accent}, ${brand})` }}
            aria-hidden
          >
            ✓
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function SectionRule() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-300/55 to-transparent" />
    </div>
  );
}
