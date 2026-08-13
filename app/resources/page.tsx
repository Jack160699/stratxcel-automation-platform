import type { Metadata } from "next";
import Link from "next/link";
import { PublicPageShell } from "@/app/components/public/PublicPageShell";

export const metadata: Metadata = {
  title: "Resources — Stratxcel",
  description: "Products, solutions, integrations, security, and how Stratxcel works.",
};

const LINKS = [
  { label: "All products", href: "/products" },
  { label: "Solutions", href: "/solutions" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Integrations", href: "/integrations" },
  { label: "Security", href: "/security" },
  { label: "Business Growth Audit", href: "/audit" },
  { label: "Pricing", href: "/pricing" },
  { label: "Contact", href: "/contact" },
  { label: "About", href: "/about" },
];

export default function ResourcesPage() {
  return (
    <PublicPageShell>
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="sx-public-kicker">Resources</p>
          <h1 className="sx-public-display mt-3 text-2xl sm:text-3xl">Evaluate Stratxcel</h1>
          <p className="sx-public-lead mt-3">Links to existing product, solution, trust, and commercial pages.</p>
        </div>
        <ul className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="block rounded-sx-md border border-sx-border bg-sx-surface-1 px-4 py-3 text-sm font-semibold shadow-[var(--sx-shadow-lg)] hover:bg-sx-surface-2">{link.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </PublicPageShell>
  );
}
