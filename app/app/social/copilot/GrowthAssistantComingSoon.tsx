import { Card } from "@/components/ui/Card";

/**
 * Temporary customer-facing state for Growth Assistant while its dedicated
 * visual redesign is planned separately from the rest of the reference UI
 * rebuild. This intentionally replaces the *rendering* of the real,
 * fully-functional agentic workspace (TenantCopilotFullPage.tsx) for
 * customers only — nothing backend-related is touched:
 *
 *   - TenantCopilotFullPage.tsx, useTenantAgentSession.ts, tenant-actions.ts
 *     stay in the repo unmodified and fully wired to their real APIs.
 *   - /api/social/copilot/* routes, session/action/mission tables, the
 *     Hermes execution engine, and /admin's Copilot (which shares the same
 *     saut-* infrastructure) are all untouched.
 *   - See app/app/social/copilot/page.tsx for where this is swapped back in.
 *
 * Every line of copy below describes a capability that already exists in
 * the product (missions, content generation, growth analysis via the real
 * audit/Search Growth OS pipeline, connector-driven execution) — nothing
 * here is aspirational marketing copy for an unbuilt feature.
 */
export function GrowthAssistantComingSoon() {
  return (
    <div className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl font-semibold text-sx-text">Growth Assistant</h1>
        <p className="sx-hi text-xs text-sx-text-subtle">सहायक</p>
        <p className="mt-1 text-sm text-sx-text-muted">Your AI-powered business assistant.</p>
      </div>

      <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sx-accent-muted">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="1.8">
            <path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
            <circle cx="12" cy="12" r="4.2" />
          </svg>
        </span>

        <div>
          <span className="inline-flex items-center rounded-lg bg-sx-accent-muted px-2.5 py-1 text-[11px] font-semibold text-sx-accent">
            Coming soon
          </span>
          <p className="mt-3 text-[15px] font-semibold text-sx-text">
            AI-powered help for your business is being prepared.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-sx-text-muted">
            We&rsquo;re redesigning Growth Assistant around a simpler conversation experience. It&rsquo;ll still be
            able to do everything it does today — we&rsquo;re just making it easier to use.
          </p>
        </div>

        <div className="mt-2 w-full rounded-sx-md bg-sx-surface-2 p-4 text-left">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">
            Soon you&rsquo;ll be able to ask it to
          </p>
          <ul className="flex flex-col gap-2">
            {[
              "Create posters and social content for your business",
              "Improve your marketing and local search visibility",
              "Analyze your business growth audit and find opportunities",
              "Execute growth tasks and campaigns for you",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-sx-text">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sx-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
