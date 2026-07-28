import Link from "next/link";
import { PageHero } from "@/app/components/PageHero";
import {
  CTAMicrocopy,
  CTARow,
  GhostButton,
  PrimaryButton,
  TrustChips,
} from "@/app/components/marketing-ui";

const canonicalUrl = "https://www.stratxcel.in/social-autopilot";
const description =
  "StratXcel Social Autopilot is an AI-powered social media operations workspace for planning, creating, scheduling, publishing, monitoring, and analyzing content across connected social platforms.";

export const metadata = {
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

const workflow = [
  {
    title: "Plan",
    body: "Shape campaigns, content pillars, audiences, and a practical publishing rhythm.",
  },
  {
    title: "Create",
    body: "Develop content masters and platform-ready variants grounded in the Brand Brain.",
  },
  {
    title: "Schedule",
    body: "Organize approved content against the planner and connected account workflow.",
  },
  {
    title: "Publish",
    body: "Send approved content through configured platform connections and operating controls.",
  },
  {
    title: "Monitor",
    body: "Inspect connected accounts, system status, publishing work, and available activity.",
  },
  {
    title: "Analyze",
    body: "Review captured performance data and use it to inform future content decisions.",
  },
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
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700 sm:text-[11px]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-pretty text-2xl font-semibold tracking-[-0.04em] text-[#0B1220] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-4 text-[15px] leading-relaxed text-slate-600 sm:text-[16px]">
        {sectionDescription}
      </p>
    </div>
  );
}

export default function SocialAutopilotPage() {
  return (
    <>
      <PageHero
        eyebrow="AI Social Operations"
        title="StratXcel Social Autopilot"
        description={description}
      >
        <div className="space-y-6">
          <CTARow className="sm:justify-start">
            <PrimaryButton href="/contact">Talk to Stratxcel</PrimaryButton>
            <GhostButton href="#what-it-does">See how it works</GhostButton>
          </CTARow>
          <p className="max-w-2xl text-[13px] leading-relaxed text-slate-500 sm:text-[14px]">
            Users connect and authorize their own social accounts. Publishing and other external
            actions remain subject to configured controls, approval policies, and operating modes.
          </p>
        </div>
      </PageHero>

      <section id="what-it-does" className="scroll-mt-24 border-b border-slate-200/60 bg-white py-14 sm:py-18 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="What it does"
            title="One workspace for the social operations cycle"
            description="Social Autopilot brings content creation, campaigns, scheduling, analytics, account operations, and automation into a structured workflow. Capabilities depend on the platform connection and permissions available."
          />
          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-200/80 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
            {workflow.map((item, index) => (
              <li key={item.title} className="min-w-0 bg-white p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] font-semibold text-blue-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#0B1220]">
                    {item.title}
                  </h3>
                </div>
                <p className="mt-3 text-[14px] leading-relaxed text-slate-600">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-slate-200/60 bg-[#F8FAFC] py-14 sm:py-18 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Connected platforms"
            title="Work with the accounts your team authorizes"
            description="Connected platforms can include Instagram, Facebook, Threads, LinkedIn, and YouTube. Available actions vary by platform, account type, granted permissions, and API support."
          />
          <ul className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:mt-11 lg:grid-cols-5">
            {platforms.map((platform, index) => (
              <li
                key={platform}
                className="flex min-h-24 min-w-0 flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_30px_-24px_rgba(11,18,32,0.28)] sm:min-h-28 sm:p-5"
              >
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 font-mono text-[11px] font-semibold text-blue-700"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mt-4 truncate text-[14px] font-semibold text-[#0B1220] sm:text-[15px]">
                  {platform}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-slate-200/60 bg-white py-14 sm:py-18 lg:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1.04fr)_minmax(20rem,0.96fr)] lg:items-start lg:gap-16 lg:px-8">
          <div>
            <SectionHeading
              eyebrow="AI Copilot"
              title="Assistance grounded in the way your brand operates"
              description="The Copilot helps turn a mission into visible, reviewable work. It uses relevant workspace context and reports operational progress without exposing private model reasoning."
            />
            <ul className="mt-8 space-y-3">
              {copilotCapabilities.map((capability) => (
                <li key={capability} className="flex gap-3 text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                  <span
                    aria-hidden
                    className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
                  />
                  <span>{capability}</span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="rounded-3xl border border-slate-200/80 bg-[#F8FAFC] p-6 shadow-[0_24px_64px_-48px_rgba(11,18,32,0.35)] sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700">
              Control &amp; safety
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.035em] text-[#0B1220] sm:text-2xl">
              Automation stays inside configured boundaries
            </h2>
            <div className="mt-6 space-y-5 text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
              <p>
                Users authorize the accounts they control. Automation behavior is governed by
                configurable autonomy, guardrails, operating mode, and approval policy.
              </p>
              <p>
                Publishing and other external actions can be restricted or held for review. Users
                remain responsible for the accounts they authorize and the content they choose to
                publish.
              </p>
            </div>
            <TrustChips
              className="mt-7 !items-start !justify-start !gap-3"
              items={[
                "User-authorized accounts",
                "Configurable approval policies",
                "Visible operational progress",
              ]}
            />
          </aside>
        </div>
      </section>

      <section className="bg-[#0B1220] py-14 text-white sm:py-18 lg:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.82fr)] lg:gap-16 lg:px-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-300 sm:text-[11px]">
              Data &amp; authorization
            </p>
            <h2 className="mt-3 max-w-2xl text-pretty text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              Platform access is requested for the social media work users choose to perform
            </h2>
            <div className="mt-5 max-w-3xl space-y-4 text-[15px] leading-relaxed text-slate-300 sm:text-[16px]">
              <p>
                Social Autopilot uses the relevant platform OAuth and API flows to request
                permissions. Authorized access supports connected-account operations such as
                content workflows, publishing, monitoring, and available analytics.
              </p>
              <p>
                Users can disconnect integrations. Details about information handling and deletion
                requests are available in the policies linked here and in the site footer.
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
                className="group rounded-2xl border border-white/15 bg-white/[0.06] p-5 transition-colors hover:border-blue-300/45 hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/60"
              >
                <span className="flex items-center justify-between gap-4">
                  <span className="font-semibold text-white">{label}</span>
                  <span aria-hidden className="text-blue-300 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
                <span className="mt-2 block text-[13px] leading-relaxed text-slate-400">{detail}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section className="bg-[#F8FAFC] py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#0B1220]">
            Bring your social operations into one accountable workspace
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-600">
            Talk to Stratxcel about account support, platform fit, and the operating controls your
            team needs.
          </p>
          <CTARow className="mt-7">
            <PrimaryButton href="/contact">Contact Stratxcel</PrimaryButton>
            <GhostButton href="/privacy">Review the Privacy Policy</GhostButton>
          </CTARow>
          <CTAMicrocopy>We will confirm scope and platform requirements before setup.</CTAMicrocopy>
        </div>
      </section>
    </>
  );
}
