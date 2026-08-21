"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * StratXcel Onboarding reference step 0 — pure value proposition, no data
 * entry. "Get started" advances to Business; "Sign in" is a real link for
 * a returning user who landed here by mistake (e.g. session expired).
 */
export function StepWelcome({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <div className="flex w-full flex-col gap-8">
      <div>
        <h1 className="font-sx-sans text-2xl font-bold leading-tight text-sx-text sm:text-[26px]">
          Let&rsquo;s get your business ready for its free growth audit.
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-sx-text-muted">Takes about 3 minutes. No credit card required.</p>
      </div>

      <div className="flex flex-col gap-4">
        <Benefit
          tint="rgba(27,95,227,0.06)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sx-accent)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          }
          title="Free business health check"
          detail="See exactly where you stand online compared to nearby competitors."
        />
        <Benefit
          tint="var(--sx-success-tint)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sx-success)" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>
          }
          title="Your personalised growth plan"
          detail="Clear, prioritised actions tailored to your business and your goals."
        />
        <Benefit
          tint="var(--sx-warning-tint)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sx-warning)" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          }
          title="Ready in minutes"
          detail="We handle the scanning and setup while you focus on running your shop."
        />
      </div>

      <div>
        <Button type="button" variant="primary" size="touch" onClick={onGetStarted} className="flex h-[52px] w-full items-center justify-center gap-1.5 text-[16px] font-bold">
          Get started
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </Button>
        <p className="mt-3.5 text-center text-[13px] text-sx-text-subtle">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-sx-accent">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Benefit({ tint, icon, title, detail }: { tint: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sx-md" style={{ background: tint }}>
        {icon}
      </span>
      <div>
        <p className="text-[15px] font-semibold text-sx-text">{title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-sx-text-muted">{detail}</p>
      </div>
    </div>
  );
}
