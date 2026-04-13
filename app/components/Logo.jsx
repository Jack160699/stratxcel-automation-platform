import Image from "next/image";
import Link from "next/link";
import { OFFICIAL_LOGO } from "@/lib/brand";

/**
 * Official Stratxcel mark — `/public/logo-v2.png` only.
 * @param {"light" | "dark"} variant — on dark backgrounds, a slight lift in brightness (no invert).
 * @param {boolean} showWordmark
 */
export function Logo({ variant = "light", priority = false, showWordmark = true }) {
  const isDark = variant === "dark";
  const focusRing = isDark
    ? "focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1220]"
    : "focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8FAFC]";

  const wordmarkClass = isDark
    ? "text-[15px] font-semibold tracking-[-0.02em] text-white sm:text-[15px]"
    : "text-[15px] font-semibold tracking-[-0.02em] text-[#0B1220] sm:text-[15px]";

  const iconShell =
    "relative inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center sm:h-8 sm:w-8 " +
    (isDark ? "brightness-[1.08] contrast-[1.06]" : "");

  return (
    <Link
      href="/"
      className={`group flex shrink-0 items-center gap-2 outline-none transition-opacity duration-200 ease-out hover:opacity-90 sm:gap-2.5 ${focusRing}`}
      aria-label="Stratxcel home"
    >
      <span className={iconShell} aria-hidden>
        <Image
          src="/logo-v2.png"
          alt=""
          role="presentation"
          width={OFFICIAL_LOGO.width}
          height={OFFICIAL_LOGO.height}
          priority={priority}
          quality={100}
          sizes="(max-width: 639px) 28px, 32px"
          unoptimized
          className="max-h-full max-w-full object-contain"
        />
      </span>
      {showWordmark ? (
        <span className={`select-none leading-none ${wordmarkClass}`}>Stratxcel</span>
      ) : null}
    </Link>
  );
}
