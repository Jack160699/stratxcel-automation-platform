import Link from "next/link";
import { COLORS } from "@/lib/constants";

export function Logo({ variant = "light" }) {
  const word =
    variant === "dark"
      ? "text-[15px] font-semibold tracking-[-0.03em] text-white"
      : "text-[15px] font-semibold tracking-[-0.03em] text-[#0B1220]";

  return (
    <Link href="/" className="group flex items-center gap-3">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center sm:h-9 sm:w-9">
        <span
          className="absolute inset-0 rounded-xl opacity-35 blur-md transition duration-500 group-hover:opacity-60"
          style={{
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.brand})`,
          }}
        />
        <span
          className="relative flex h-8 w-8 items-center justify-center rounded-xl text-[13px] font-semibold tracking-tight text-white ring-1 ring-white/30 transition duration-300 group-hover:-translate-y-px sm:h-9 sm:w-9 sm:text-sm"
          style={{
            background: `linear-gradient(145deg, ${COLORS.accent} 0%, ${COLORS.brand} 100%)`,
            boxShadow: "0 2px 16px -4px rgba(30, 58, 138, 0.4)",
          }}
        >
          S
        </span>
      </span>
      <span className={word}>Stratxcel</span>
    </Link>
  );
}
