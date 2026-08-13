import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";

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
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="mx-auto max-w-7xl flex-1 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-sx-mono text-[11px] font-bold uppercase tracking-[0.18em] text-sx-accent">Resources</p>
          <h1 className="mt-3 font-sx-sans text-2xl font-bold sm:text-3xl">Evaluate Stratxcel</h1>
          <p className="mt-3 text-sm text-sx-text-muted sm:text-base">Links to existing product, solution, trust, and commercial pages.</p>
        </div>
        <ul className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="block rounded-sx-md border border-sx-border bg-sx-surface-1 px-4 py-3 text-sm font-semibold hover:bg-sx-surface-2">{link.label}</Link>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}
