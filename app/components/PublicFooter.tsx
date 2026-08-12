import Link from "next/link";
import { Logo } from "./Logo";
import { CONTACT_EMAIL } from "@/lib/constants";

const COLUMNS = [
  { title: "Product", links: [{ label: "All products", href: "/products" }, { label: "Social Autopilot", href: "/social-autopilot" }, { label: "Integrations", href: "/integrations" }, { label: "Pricing & Plans", href: "/pricing" }] },
  { title: "Solutions", links: [{ label: "Use cases overview", href: "/use-cases" }, { label: "Lead generation", href: "/use-cases" }, { label: "Content consistency", href: "/use-cases" }, { label: "WhatsApp follow-up", href: "/use-cases" }] },
  { title: "Resources", links: [{ label: "How it works", href: "/how-it-works" }, { label: "Security", href: "/security" }, { label: "Business Growth Audit", href: "/audit" }, { label: "Contact", href: "/contact" }] },
  { title: "Company", links: [{ label: "About", href: "/about" }, { label: "Contact sales", href: "/contact" }, { label: "Book a demo", href: "/contact?intent=demo" }] },
  { title: "Legal", links: [{ label: "Privacy Policy", href: "/privacy" }, { label: "Terms of Service", href: "/terms" }, { label: "Data Deletion", href: "/data-deletion" }] },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-sx-border bg-sx-bg text-sx-text">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-1">
            <Logo variant="dark" />
            <p className="mt-3 text-xs text-sx-text-muted">Stratxcel runs growth work that turns attention into opportunities.</p>
            <p className="mt-3 font-sx-mono text-[11px] font-semibold text-sx-accent">https://www.stratxcel.in</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="font-sx-mono text-[10px] font-bold uppercase tracking-[0.14em] text-sx-accent">{col.title}</p>
              <ul className="mt-3.5 space-y-2 text-xs">
                {col.links.map((item) => (<li key={item.href + item.label}><Link href={item.href} className="font-medium text-sx-text-muted hover:text-sx-text">{item.label}</Link></li>))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-sx-border px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-sx-text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Stratxcel Technologies. All rights reserved.</p>
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium hover:text-sx-text">Contact: {CONTACT_EMAIL}</a>
        </div>
      </div>
    </footer>
  );
}
