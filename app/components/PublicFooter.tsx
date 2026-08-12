import Link from "next/link";
import { Logo } from "./Logo";
import { CONTACT_EMAIL } from "@/lib/constants";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "What Stratxcel does", href: "/modules" },
      { label: "Social Autopilot", href: "/social-autopilot" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Pricing & Plans", href: "/pricing" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "All solutions", href: "/solutions" },
      { label: "Lead generation", href: "/solutions#more-leads" },
      { label: "Content consistency", href: "/solutions#grow-social" },
      { label: "WhatsApp follow-up", href: "/solutions#automate-whatsapp" },
      { label: "Website & discovery", href: "/solutions#improve-website" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Security", href: "/security" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Business Audit", href: "/audit" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Data Deletion", href: "/data-deletion" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-sx-border bg-sx-bg text-sx-text">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Logo variant="dark" />
            <p className="mt-3 font-sx-sans text-xs leading-relaxed text-sx-text-muted">
              Stratxcel runs the growth work that turns attention into opportunities and helps turn more opportunities into customers.
            </p>
            <p className="mt-3 font-sx-mono text-[11px] font-semibold text-sx-accent">https://www.stratxcel.in</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-accent">{col.title}</p>
              <ul className="mt-3.5 space-y-2 text-xs">
                {col.links.map((item) => (
                  <li key={item.href + item.label}>
                    <Link href={item.href} className="font-sx-sans font-medium text-sx-text-muted transition-colors hover:text-sx-text">
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
        <div className="mx-auto flex max-w-7xl flex-col gap-2 font-sx-sans text-xs text-sx-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Stratxcel Technologies. All rights reserved.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium hover:text-sx-text">
            Contact: {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
