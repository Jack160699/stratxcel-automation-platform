import type { ReactNode } from "react";
import { DEMO_BUSINESS } from "@/app/components/public/showcase/fixtures/showcase-data";

/**
 * Large, sanitized Stratxcel interface fragments for the homepage product
 * chapters. Every value is a neutral product state — a thing the software is
 * showing you — never a result, ranking, percentage, or revenue figure.
 */

function AppFrame({
  title,
  nav,
  children,
}: {
  title: string;
  nav: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-sx-lg border border-sx-border bg-sx-bg shadow-[var(--sx-public-shadow-product)]">
      <div className="flex items-center gap-2 border-b border-sx-border bg-sx-surface-2 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-sx-border-strong" />
          <span className="h-2 w-2 rounded-full bg-sx-border-strong" />
          <span className="h-2 w-2 rounded-full bg-sx-border-strong" />
        </span>
        <span className="ml-1 truncate font-sx-mono text-[10px] uppercase tracking-[0.14em] text-sx-text-subtle">
          {title}
        </span>
      </div>
      <div className="grid sm:grid-cols-[128px_minmax(0,1fr)]">
        <nav className="hidden flex-col gap-0.5 border-r border-sx-border bg-sx-surface-2/60 p-2.5 sm:flex" aria-hidden>
          {nav.map((item, i) => (
            <span
              key={item}
              className={`rounded-sx-sm px-2.5 py-1.5 font-sx-sans text-[11.5px] ${
                i === 0 ? "bg-sx-accent-muted font-semibold text-sx-accent" : "text-sx-text-subtle"
              }`}
            >
              {item}
            </span>
          ))}
        </nav>
        <div className="min-w-0 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function StateChip({ tone = "accent", children }: { tone?: "accent" | "neutral" | "warn"; children: ReactNode }) {
  const cls =
    tone === "accent"
      ? "border-sx-accent/30 bg-sx-accent-muted text-sx-accent"
      : tone === "warn"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-700"
        : "border-sx-border bg-sx-surface-2 text-sx-text-subtle";
  return (
    <span className={`shrink-0 rounded-sx-pill border px-2.5 py-1 font-sx-mono text-[9.5px] uppercase tracking-[0.1em] ${cls}`}>
      {children}
    </span>
  );
}

function Bar({ w, tone = "muted" }: { w: string; tone?: "muted" | "faint" | "strong" }) {
  const bg = tone === "strong" ? "bg-sx-border-strong" : tone === "muted" ? "bg-sx-border" : "bg-sx-border/60";
  return <span className={`block h-1.5 rounded-full ${bg}`} style={{ width: w }} />;
}

export function SearchChapterVisual() {
  return (
    <AppFrame title="Search & Discovery" nav={["Discovery", "Website", "Local listing", "Content", "Reports"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sx-sans text-[14px] font-semibold text-sx-text">What people search for</p>
          <p className="mt-0.5 truncate font-sx-mono text-[11px] text-sx-text-subtle">{DEMO_BUSINESS.website}</p>
        </div>
        <StateChip>Opportunity found</StateChip>
      </div>

      <div className="mt-4 space-y-2">
        {[
          { area: "Google Business Profile", note: "Hours and service area are incomplete", tone: "warn" as const, state: "Needs attention" },
          { area: "Menu page", note: "Page title does not mention the location", tone: "accent" as const, state: "Suggested fix" },
          { area: "Service pages", note: "Two pages describe the same thing", tone: "accent" as const, state: "Suggested fix" },
          { area: "Directory listings", note: "Address matches across all connected listings", tone: "neutral" as const, state: "No action" },
        ].map((row) => (
          <div
            key={row.area}
            className="flex items-center justify-between gap-3 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-sx-sans text-[13.5px] font-medium text-sx-text">{row.area}</p>
              <p className="mt-0.5 truncate font-sx-sans text-[12px] text-sx-text-muted">{row.note}</p>
            </div>
            <StateChip tone={row.tone}>{row.state}</StateChip>
          </div>
        ))}
      </div>

      <p className="mt-4 font-sx-sans text-[11.5px] leading-relaxed text-sx-text-subtle">
        Search improvements are opportunities to work on — not a promise of rankings or traffic.
      </p>
    </AppFrame>
  );
}

export function SocialChapterVisual() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const planned: Record<string, string | undefined> = { Tue: "Reel", Thu: "Post", Sat: "Story" };

  return (
    <AppFrame title="Social Copilot" nav={["Plan", "Drafts", "Approvals", "Published", "Brand"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sx-sans text-[14px] font-semibold text-sx-text">This week</p>
        <StateChip>Approval required</StateChip>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div
            key={d}
            className={`rounded-sx-sm border px-1 py-2.5 text-center ${
              planned[d] ? "border-sx-accent/30 bg-sx-accent-muted" : "border-sx-border bg-sx-surface-2"
            }`}
          >
            <p className="font-sx-mono text-[9.5px] uppercase tracking-[0.08em] text-sx-text-subtle">{d}</p>
            <p
              className={`mt-1.5 font-sx-sans text-[10.5px] font-medium ${
                planned[d] ? "text-sx-accent" : "text-transparent"
              }`}
            >
              {planned[d] ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,120px)_minmax(0,1fr)]">
        <div className="aspect-square rounded-sx-sm border border-sx-border bg-sx-surface-2" aria-hidden />
        <div className="min-w-0">
          <p className="font-sx-sans text-[13.5px] font-semibold text-sx-text">Draft caption</p>
          <div className="mt-2.5 space-y-1.5">
            <Bar w="100%" />
            <Bar w="92%" />
            <Bar w="64%" tone="faint" />
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="rounded-sx-sm bg-sx-accent px-3.5 py-1.5 font-sx-sans text-[12px] font-semibold text-sx-accent-on">
              Approve
            </span>
            <span className="rounded-sx-sm border border-sx-border-strong px-3.5 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text">
              Edit
            </span>
            <span className="font-sx-sans text-[11.5px] text-sx-text-subtle">Nothing publishes until you approve.</span>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

export function CrmChapterVisual() {
  const threads = [
    { who: "Website form", note: "Asked about weekday delivery", state: "New enquiry", active: true },
    { who: "WhatsApp", note: "Wants a table for six", state: "Awaiting reply", active: false },
    { who: "Instagram", note: "Asked about the roast of the week", state: "Assigned", active: false },
  ];

  return (
    <AppFrame title="Customers & Conversations" nav={["Inbox", "Enquiries", "WhatsApp", "Owners", "Activity"]}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-2">
          {threads.map((t) => (
            <div
              key={t.who}
              className={`rounded-sx-sm border px-3 py-3 ${
                t.active ? "border-sx-accent/35 bg-sx-accent-muted" : "border-sx-border bg-sx-surface-1"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-sx-sans text-[13px] font-semibold text-sx-text">{t.who}</p>
                <span className="shrink-0 font-sx-mono text-[9px] uppercase tracking-[0.1em] text-sx-text-subtle">
                  {t.state}
                </span>
              </div>
              <p className="mt-1 truncate font-sx-sans text-[12px] text-sx-text-muted">{t.note}</p>
            </div>
          ))}
        </div>

        <div className="rounded-sx-sm border border-sx-border bg-sx-surface-1 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="font-sx-sans text-[13px] font-semibold text-sx-text">Website form</p>
            <StateChip>Suggested reply</StateChip>
          </div>

          <div className="mt-3 max-w-[88%] rounded-sx-sm rounded-tl-[3px] border border-sx-border bg-sx-surface-2 px-3 py-2">
            <p className="font-sx-sans text-[12.5px] text-sx-text">
              Do you deliver to offices on weekday mornings?
            </p>
          </div>

          <div className="ml-auto mt-2.5 max-w-[88%] rounded-sx-sm rounded-tr-[3px] border border-sx-accent/30 bg-sx-accent-muted px-3 py-2">
            <p className="font-sx-sans text-[12.5px] text-sx-text">
              Yes, weekday mornings work. Would you like the standing order options?
            </p>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-sx-border pt-3.5">
            <span className="rounded-sx-sm bg-sx-accent px-3.5 py-1.5 font-sx-sans text-[12px] font-semibold text-sx-accent-on">
              Send
            </span>
            <span className="rounded-sx-sm border border-sx-border-strong px-3.5 py-1.5 font-sx-sans text-[12px] font-medium text-sx-text">
              Rewrite
            </span>
            <span className="ml-auto font-sx-sans text-[11.5px] text-sx-text-subtle">Owner: you</span>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

export function AnalyticsChapterVisual() {
  const shape = [42, 58, 47, 66, 55, 72, 61, 68, 53, 74, 63, 70];

  return (
    <AppFrame title="Performance" nav={["Summary", "Channels", "Enquiries", "Content", "Reports"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sx-sans text-[14px] font-semibold text-sx-text">Performance summary</p>
        <StateChip>Ready to review</StateChip>
      </div>

      <div className="mt-4 rounded-sx-sm border border-sx-border bg-sx-surface-1 p-4">
        <div className="flex h-28 items-end gap-1.5" aria-hidden>
          {shape.map((h, i) => (
            <span
              key={i}
              className="w-full rounded-t-[3px] bg-gradient-to-t from-sx-accent/20 to-sx-accent/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <p className="mt-3 font-sx-sans text-[11.5px] text-sx-text-subtle">
          Activity across your connected channels, in one view.
        </p>
      </div>

      <div className="mt-4">
        <p className="font-sx-mono text-[10px] uppercase tracking-[0.16em] text-sx-text-subtle">Worth a look</p>
        <div className="mt-2.5 space-y-2">
          {[
            "Enquiries are arriving faster than they are being answered",
            "One channel has had no activity this month",
            "A page customers land on has no way to contact you",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 rounded-sx-sm border border-sx-border bg-sx-surface-1 px-3 py-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" aria-hidden />
              <p className="font-sx-sans text-[13px] leading-relaxed text-sx-text">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
