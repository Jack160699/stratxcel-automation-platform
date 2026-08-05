import Link from "next/link";
import { Logo } from "./Logo";
import { CONTACT_EMAIL } from "@/lib/constants";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Products", href: "/modules" },
      { label: "Solutions", href: "/use-cases" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Security", href: "/security" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Data deletion", href: "/data-deletion" },
    ],
  },
];

/** Public site footer — docs/product-design/PUBLIC_WEBSITE_SITEMAP.md's footer spec, on Core tokens. */
export function PublicFooter() {
  return (
    <footer className="border-t border-sx-border bg-sx-bg">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <Logo variant="dark" />
            <p className="mt-3 max-w-xs font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
              One workspace to submit goals, track execution, and approve what your business needs done.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-sx-mono text-[10px] uppercase tracking-[0.14em] text-sx-text-subtle">{col.title}</p>
              <ul className="mt-3.5 space-y-2.5">
                {col.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="font-sx-sans text-[13px] text-sx-text-muted transition-colors hover:text-sx-text">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-sx-border px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 font-sx-sans text-[12px] text-sx-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Stratxcel. All rights reserved.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-sx-text-muted">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
