import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { SignupForm } from "./SignupForm";
import { establishPendingWorkspaceIntent } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Create Account — Stratxcel Workspace",
  description: "Start your Stratxcel business growth workspace.",
  robots: { index: false, follow: true },
};

export default async function SignupPage() {
  await establishPendingWorkspaceIntent("customer");
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1 flex items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl w-full grid gap-10 lg:grid-cols-2 items-center">
          {/* Left Panel: Desktop Onboarding Value Pitch */}
          <div className="hidden lg:flex flex-col justify-center space-y-6 pr-6 border-r border-sx-border">
            <span className="inline-block w-max rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Get Started with Stratxcel
            </span>
            <h2 className="font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text">
              A secure workspace for your Business Growth Audit.
            </h2>
            <p className="font-sx-sans text-sm text-sx-text-muted leading-relaxed">
              Create your organization&rsquo;s isolated workspace to claim a paid Audit, complete the guided intake, and receive your automatic growth roadmap.
            </p>

            <ul className="space-y-3 text-xs text-sx-text-muted">
              <li className="flex items-center gap-2">
                <span className="text-sx-accent font-bold">✓</span>
                <span>Database-level tenant isolation (Supabase RLS)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-sx-accent font-bold">✓</span>
                <span>Automatic Audit analysis with a clear delivery status</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-sx-accent font-bold">✓</span>
                <span>Audit fee adjustment guarantee on qualifying plans</span>
              </li>
            </ul>

            <div className="text-xs text-sx-text-subtle flex gap-4 border-t border-sx-border pt-4">
              <Link href="/audit" className="text-sx-accent font-semibold underline hover:text-sx-accent/80">
                Learn about the ₹999 Business Growth Audit →
              </Link>
            </div>
          </div>

          {/* Right Panel: Account Form */}
          <div className="w-full max-w-md mx-auto">
            <span className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-accent">Account Creation</span>
            <h1 className="mt-2 font-sx-sans text-2xl font-extrabold tracking-tight text-sx-text sm:text-3xl">
              Start with Stratxcel
            </h1>
            <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">
              Create your account to access your organization&rsquo;s secure workspace.
            </p>

            <Card variant="panel" className="mt-6 p-6 sm:p-8 border-sx-border shadow-2xl">
              <SignupForm />
            </Card>

            <p className="mt-6 text-center font-sx-sans text-xs text-sx-text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-sx-accent hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
