import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";

const canonicalUrl = "https://www.stratxcel.in/social-autopilot";
const description =
  "StratXcel Social Autopilot is an AI-powered social media operations workspace for planning, creating, scheduling, publishing, monitoring, and analyzing content across connected social platforms.";

export const metadata: Metadata = {
  title: "StratXcel Social Autopilot",
  description,
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: "StratXcel Social Autopilot",
    description,
    type: "website",
    url: canonicalUrl,
  },
};

const workflow: { title: string; body: string }[] = [
  { title: "Plan", body: "Shape campaigns, content pillars, audiences, and a practical publishing rhythm." },
  { title: "Create", body: "Develop content masters and platform-ready variants grounded in the Brand Brain." },
  { title: "Schedule", body: "Organize approved content against the planner and connected account workflow." },
  { title: "Publish", body: "Send approved content through configured platform connections and operating controls." },
  { title: "Monitor", body: "Inspect connected accounts, system status, publishing work, and available activity." },
  { title: "Analyze", body: "Review captured performance data and use it to inform future content decisions." },
];

const platforms = ["Instagram", "Facebook", "Threads", "LinkedIn", "YouTube"];

const copilotCapabilities = [
  "Plan campaigns and content around your saved Brand Brain",
  "Generate and refine content for connected social platforms",
  "Analyze available performance and operational information",
  "Execute permitted workflows with visible progress and review points",
  "Inspect system status and connected account health",
];

function SectionHeading({
  eyebrow,
  title,
  description: sectionDescription,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sx-accent">{eyebrow}</p>
      <h2 className="mt-3 font-sx-sans text-2xl font-semibold tracking-[-0.03em] text-sx-text sm:text-3xl">{title}</h2>
      <p className="mt-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">{sectionDescription}</p>
    </div>
  );
}

export default function SocialAutopilotPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">AI Social Operations</p>
          <h1 className="mt-4 max-w-2xl font-sx-sans text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.02em] text-sx-text">
            StratXcel Social Autopilot
          </h1>
          <p className="mt-5 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">{description}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="/contact"
              className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
            >
              Talk to Stratxcel
            </a>
            <a
              href="#what-it-does"
              className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 max-w-2xl font-sx-sans text-[13px] leading-relaxed text-sx-text-subtle">
            Users connect and authorize their own social accounts. Publishing and other external actions remain subject to
            configured controls, approval policies, and operating modes.
          </p>
        </section>

        <section id="what-it-does" className="scroll-mt-24 border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
            <SectionHeading
              eyebrow="What it does"
              title="One workspace for the social operations cycle"
              description="Social Autopilot brings content creation, campaigns, scheduling, analytics, account operations, and automation into a structured workflow. Capabilities depend on the platform connection and permissions available."
            />
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
              {workflow.map((item, index) => (
                <Card key={item.title} variant="panel" className="p-6">
                  <div className="flex items-center gap-3">
                    <span className="font-sx-mono text-[11px] font-semibold text-sx-accent">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-sx-sans text-base font-semibold tracking-[-0.015em] text-sx-text">
                      {item.title}
                    </h3>
                  </div>
                  <p className="mt-3 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">{item.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-bg">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-18 lg:px-8">
            <SectionHeading
              eyebrow="Connected platforms"
              title="Work with the accounts your team authorizes"
              description="Connected platforms can include Instagram, Facebook, Threads, LinkedIn, and YouTube. Available actions vary by platform, account type, granted permissions, and API support."
            />
            <ul className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-11 lg:grid-cols-5">
              {platforms.map((platform, index) => (
                <li key={platform}>
                  <Card variant="panel" className="flex min-h-24 flex-col justify-between p-4 sm:min-h-28 sm:p-5">
                    <span
                      aria-hidden
                      className="flex h-8 w-8 items-center justify-center rounded-sx-sm bg-sx-accent-muted font-sx-mono text-[11px] font-semibold text-sx-accent"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-4 truncate font-sx-sans text-[14px] font-semibold text-sx-text sm:text-[15px]">
                      {platform}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-1">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[minmax(0,1.04fr)_minmax(20rem,0.96fr)] lg:items-start lg:gap-16 lg:px-8">
            <div>
              <SectionHeading
                eyebrow="AI Copilot"
                title="Assistance grounded in the way your brand operates"
                description="The Copilot helps turn a mission into visible, reviewable work. It uses relevant workspace context and reports operational progress without exposing private model reasoning."
              />
              <ul className="mt-8 space-y-3">
                {copilotCapabilities.map((capability) => (
                  <li key={capability} className="flex gap-3 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
                    <span aria-hidden className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" />
                    <span>{capability}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Card variant="ai" className="p-6 sm:p-8">
              <p className="font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sx-ai">
                Control &amp; safety
              </p>
              <h2 className="mt-3 font-sx-sans text-xl font-semibold tracking-[-0.025em] text-sx-text sm:text-2xl">
                Automation stays inside configured boundaries
              </h2>
              <div className="mt-6 space-y-5 font-sx-sans text-[14px] leading-relaxed text-sx-text-muted">
                <p>
                  Users authorize the accounts they control. Automation behavior is governed by configurable autonomy,
                  guardrails, operating mode, and approval policy.
                </p>
                <p>
                  Publishing and other external actions can be restricted or held for review. Users remain responsible
                  for the accounts they authorize and the content they choose to publish.
                </p>
              </div>
              <ul className="mt-7 flex flex-col gap-2.5">
                {["User-authorized accounts", "Configurable approval policies", "Visible operational progress"].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2 font-sx-sans text-[12.5px] text-sx-text-muted">
                      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-sx-accent-muted text-[9px] font-bold text-sx-accent">
                        ✓
                      </span>
                      <span>{item}</span>
                    </li>
                  )
                )}
              </ul>
            </Card>
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-surface-2">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-18 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.82fr)] lg:gap-16 lg:px-8">
            <div>
              <p className="font-sx-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sx-accent">
                Data &amp; authorization
              </p>
              <h2 className="mt-3 max-w-2xl font-sx-sans text-2xl font-semibold tracking-[-0.03em] text-sx-text sm:text-3xl">
                Platform access is requested for the social media work users choose to perform
              </h2>
              <div className="mt-5 max-w-3xl space-y-4 font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
                <p>
                  Social Autopilot uses the relevant platform OAuth and API flows to request permissions. Authorized
                  access supports connected-account operations such as content workflows, publishing, monitoring, and
                  available analytics.
                </p>
                <p>
                  Users can disconnect integrations. Details about information handling and deletion requests are
                  available in the policies linked here and in the site footer.
                </p>
              </div>
            </div>

            <nav aria-label="Social Autopilot legal information" className="grid content-start gap-3">
              {[
                ["Privacy Policy", "/privacy", "How Stratxcel processes and protects information."],
                ["Terms of Service", "/terms", "Rules and responsibilities for using the service."],
                ["Data Deletion", "/data-deletion", "How to request deletion of connected and stored data."],
              ].map(([label, href, detail]) => (
                <Link
                  key={href}
                  href={href}
                  className="group rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 transition-colors hover:border-sx-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sx-accent"
                >
                  <span className="flex items-center justify-between gap-4">
                    <span className="font-sx-sans font-semibold text-sx-text">{label}</span>
                    <span aria-hidden className="text-sx-accent transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </span>
                  <span className="mt-2 block font-sx-sans text-[13px] leading-relaxed text-sx-text-muted">{detail}</span>
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <section className="border-t border-sx-border bg-sx-bg py-14 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="font-sx-sans text-2xl font-semibold tracking-[-0.03em] text-sx-text">
              Bring your social operations into one accountable workspace
            </h2>
            <p className="mx-auto mt-4 max-w-2xl font-sx-sans text-[15px] leading-relaxed text-sx-text-muted">
              Talk to Stratxcel about account support, platform fit, and the operating controls your team needs.
            </p>
            <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <a
                href="/contact"
                className="rounded-sx-sm bg-sx-accent px-6 py-3 text-center font-sx-sans text-sm font-semibold text-sx-accent-on transition-colors duration-150 hover:bg-[color:var(--sx-accent-hover)]"
              >
                Contact Stratxcel
              </a>
              <a
                href="/privacy"
                className="rounded-sx-sm border border-sx-border-strong px-6 py-3 text-center font-sx-sans text-sm font-medium text-sx-text transition-colors duration-150 hover:bg-sx-surface-2"
              >
                Review the Privacy Policy
              </a>
            </div>
            <p className="mt-4 font-sx-sans text-[12px] text-sx-text-subtle">
              We will confirm scope and platform requirements before setup.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
