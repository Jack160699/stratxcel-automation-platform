import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card, CardHeading } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "Security & trust — Stratxcel",
  description: "How Stratxcel isolates client data and controls what runs without your approval.",
};

const PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "Isolation by construction, not convention",
    body: "Every workspace's data is separated at the database level using row-level security policies, not just application-layer checks. A query for one client's data structurally cannot return another's.",
  },
  {
    title: "No privileged key in the browser",
    body: "Elevated database access is never shipped to client-side code. Anything that needs it runs server-side, behind an explicit authorization check.",
  },
  {
    title: "Membership is verified, not assumed",
    body: "Access to a workspace is checked against real membership records on every request, using a secure, httpOnly session — not a client-supplied ID that could be forged or guessed.",
  },
  {
    title: "Sensitive actions wait for your approval",
    body: "Publishing, spend and outreach to your customers pause for an explicit approval before they execute. Nothing with real-world consequence runs silently.",
  },
];

export default function SecurityPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Security &amp; trust</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            Your data stays yours, and stays separated.
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
            Stratxcel is built on a tenant-isolation model rather than added on top of one. Here&rsquo;s what that means in practice.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <Card key={p.title} variant="panel">
                <CardHeading>{p.title}</CardHeading>
                <p className="mt-2 font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{p.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-xl font-semibold text-sx-text">Data handling</h2>
            <p className="mt-3 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
              Workspace data is stored in a managed Postgres database with the isolation model described above. We haven&rsquo;t yet
              published a formal retention schedule, sub-processor list, or compliance certification — if any of that is a
              requirement for your team, tell us and we&rsquo;ll answer directly rather than have you guess from a page.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <Link
            href="/contact?intent=security"
            className="inline-block rounded-sx-sm bg-sx-accent px-6 py-3 font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
          >
            Contact security team
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
