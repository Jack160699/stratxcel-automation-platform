"use client";

import Link from "next/link";
import { INTEGRATIONS } from "@/lib/commercial/catalog";

const BOUNDARIES = [
  {
    title: "Isolated Tenant Storage",
    desc: "Every business receives its own dedicated tenant schema. Data is never merged, pooled, or co-mingled across customers.",
  },
  {
    title: "Least-Privilege Scopes",
    desc: "We only request the exact OAuth permissions required to run approved tasks (e.g. read analytics, stage drafts).",
  },
  {
    title: "Consequential Action Checkpoints",
    desc: "High-stake operations (publishing content, CRM record edits, ad spend) pause for your explicit human sign-off.",
  },
  {
    title: "Zero Cross-Tenant Model Training",
    desc: "Your proprietary business data and customer conversations are never used to train third-party AI models.",
  },
];

export function HomeConnectBusiness() {
  return (
    <section
      id="integrations"
      data-home-section="connect-business"
      className="relative border-t border-sx-border bg-sx-bg py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-sx-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-sx-accent">
            INTEGRATIONS & BOUNDARIES
          </p>
          <h2 className="mt-3 font-sx-sans text-[clamp(1.8rem,3.6vw+0.4rem,3rem)] font-bold tracking-tight text-sx-text">
            Your systems stay yours.
            <br />
            <span className="text-sx-accent">Stratxcel connects the context.</span>
          </h2>
          <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted sm:text-[17px]">
            Connect the platforms you already run your business on. We operate workflows across them without moving your
            infrastructure or compromising ownership.
          </p>
        </div>

        {/* Integration Grid */}
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((item) => {
            const isVerifiedConnected = item.id === "linkedin";
            const badgeLabel = isVerifiedConnected
              ? "CONNECTED"
              : item.status === "connected" || item.status === "available"
              ? "AVAILABLE"
              : "PLANNED";

            return (
              <div
                key={item.id}
                className="flex items-start justify-between rounded-xl border border-sx-border bg-sx-surface-1 p-5 transition-all duration-150 hover:border-sx-border-strong"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-sx-sans text-[15px] font-bold text-sx-text">
                      {item.name}
                    </h3>
                    <span
                      className={`rounded px-2 py-0.5 font-sx-mono text-[9.5px] font-bold uppercase tracking-wider ${
                        isVerifiedConnected
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : badgeLabel === "AVAILABLE"
                          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          : "bg-white/5 text-white/40 border border-white/10"
                      }`}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
                    {item.note || "Governed connector for business workflow operations."}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Security & Data Boundaries Grid */}
        <div className="mt-14 rounded-2xl border border-sx-border bg-sx-surface-1 p-7 sm:p-10">
          <div className="max-w-2xl">
            <p className="font-sx-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-sx-accent">
              Security & Data Boundaries
            </p>
            <h3 className="mt-2 font-sx-sans text-xl font-bold text-sx-text sm:text-2xl">
              Strict governance. Zero unauthorized mutations.
            </h3>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {BOUNDARIES.map((b) => (
              <div key={b.title} className="rounded-xl border border-sx-border bg-sx-bg p-5">
                <p className="font-sx-sans text-sm font-bold text-sx-text">
                  {b.title}
                </p>
                <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">
                  {b.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-sx-border pt-6">
            <p className="font-sx-sans text-xs text-sx-text-subtle">
              Full transparency on data residency, encryption at rest, and audit logging.
            </p>
            <Link
              href="/security"
              className="font-sx-sans text-xs font-semibold text-sx-accent hover:underline"
            >
              Read full Security Architecture →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
