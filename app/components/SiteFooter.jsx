import Link from "next/link";
import { Logo } from "./Logo";
import { footerColumns } from "@/lib/site-nav";

function FooterLink({ item }) {
  const className = "text-[14px] text-slate-400 transition hover:text-white";
  if (item.external) {
    return (
      <a href={item.href} className={className} target="_blank" rel="noopener noreferrer">
        {item.label}
      </a>
    );
  }
  return (
    <Link href={item.href} className={className}>
      {item.label}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/10 bg-[#0B1220] text-slate-300">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent"
        aria-hidden
      />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)] lg:gap-16">
          <div>
            <Logo variant="dark" />
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[13px] sm:tracking-[0.16em]">
              AI operating systems for modern businesses
            </p>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-slate-400">
              An AI operating system for your business — modules, agents, and automation wired
              into how you already run.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5 lg:gap-8">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {col.title}
                </p>
                <ul className="mt-4 space-y-3">
                  {col.links.map((item) => (
                    <li key={item.label}>
                      <FooterLink item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-6xl border-t border-white/[0.08] px-4 py-8 text-center text-[13px] text-slate-500 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Stratxcel. All rights reserved.
      </div>
    </footer>
  );
}
