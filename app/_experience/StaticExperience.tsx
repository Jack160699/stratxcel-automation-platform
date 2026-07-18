"use client";

import Link from "next/link";
import { ContactForm } from "@/app/components/ContactForm";
import { CONTACT_EMAIL, whatsappHref } from "@/lib/constants";
import {
  AGENT_STEPS,
  CAPABILITIES,
  CASE_STUDIES,
  CHAOS_FRAGMENTS,
  ECOSYSTEM_NODES,
  EXPLORE_LINKS,
} from "./content";
import { Mark } from "./scenes";

/**
 * The same story, told statically — for reduced-motion users and devices
 * without WebGL. Everything is plain document flow.
 */
export default function StaticExperience() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-16">
      <header className="flex items-center gap-3">
        <Mark className="h-8 w-8" />
        <span className="font-mono text-[11px] tracking-[0.35em] text-slate-300">
          STRATXCEL
        </span>
      </header>

      <section className="mt-20">
        <p className="sx-kicker">the operating system for modern business</p>
        <h1 className="sx-display mt-5 text-5xl text-white sm:text-7xl">
          Stratxcel
        </h1>
        <p className="mt-6 max-w-xl text-lg font-light text-slate-300">
          Not an agency. An operating system for modern business — everything
          grows from a single intelligent core.
        </p>
      </section>

      <section className="mt-24">
        <h2 className="sx-kicker">the problem</h2>
        <p className="sx-display mt-4 text-3xl text-white">Chaos, everywhere.</p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {CHAOS_FRAGMENTS.map((f) => (
            <li key={f} className="sx-glass rounded-lg px-3 py-1.5 font-mono text-xs text-slate-300">
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-slate-400">
          Stratxcel collapses all of it into one connected, intelligent system.
        </p>
      </section>

      <section className="mt-24 space-y-12">
        <h2 className="sx-kicker">capabilities</h2>
        {CAPABILITIES.map((cap, i) => (
          <div key={cap.key} className="border-l border-white/10 pl-6">
            <p className="font-mono text-[11px] text-slate-500">
              {String(i + 1).padStart(2, "0")} / 05
            </p>
            <h3 className="sx-display mt-2 text-2xl text-white">{cap.title}</h3>
            <p className="mt-2 max-w-lg font-light text-slate-400">{cap.line}</p>
          </div>
        ))}
      </section>

      <section className="mt-24">
        <h2 className="sx-kicker">a stratxcel agent at work</h2>
        <ol className="mt-6 space-y-3">
          {AGENT_STEPS.map((s) => (
            <li key={s.label} className="flex items-baseline justify-between gap-6 border-b border-white/5 pb-3">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-slate-200">
                {s.label}
              </span>
              <span className="text-right text-sm font-light text-slate-400">{s.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-24 grid gap-8 sm:grid-cols-3">
        {CASE_STUDIES.map((cs) => (
          <div key={cs.client} className="sx-glass rounded-2xl p-5">
            <p className="sx-kicker">{cs.client}</p>
            <p className="mt-3 text-sm text-slate-300">{cs.problem}</p>
            <p className="mt-2 text-sm font-light text-slate-400">{cs.transformation}</p>
            <p className="sx-display mt-5 text-4xl text-white">
              {cs.metric.value}
              <span className="text-[#45c4ff]">{cs.metric.suffix}</span>
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
              {cs.metric.label}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-24">
        <h2 className="sx-kicker">one intelligent business ecosystem</h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          {ECOSYSTEM_NODES.map((n) => (
            <li key={n} className="sx-glass rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.15em] text-sky-100">
              {n.toUpperCase()}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-24 grid gap-10 lg:grid-cols-2">
        <nav aria-label="Main menu">
          <h2 className="sx-display text-3xl text-white">Explore</h2>
          <ul className="mt-6 space-y-3">
            {EXPLORE_LINKS.map((link, i) => (
              <li key={link.href}>
                {link.external ? (
                  <a href={link.href} target="_blank" rel="noreferrer" className="group flex items-baseline gap-3">
                    <span className="font-mono text-[11px] text-slate-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xl text-slate-200 group-hover:text-white">{link.label}</span>
                    <span className="font-mono text-[10px] text-slate-500">{link.hint}</span>
                  </a>
                ) : (
                  <Link href={link.href} className="group flex items-baseline gap-3">
                    <span className="font-mono text-[11px] text-slate-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-xl text-slate-200 group-hover:text-white">{link.label}</span>
                    <span className="font-mono text-[10px] text-slate-500">{link.hint}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="sx-glass rounded-2xl p-6">
          <p className="sx-kicker">open a channel</p>
          <h3 className="sx-display mt-3 text-2xl text-white">Engineer your business.</h3>
          <div className="mt-5">
            <ContactForm source="static-experience" />
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/10 pt-4 font-mono text-[11px] text-slate-500">
            <a className="hover:text-slate-200" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            <a className="hover:text-slate-200" href={whatsappHref} target="_blank" rel="noreferrer">
              WhatsApp ↗
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
