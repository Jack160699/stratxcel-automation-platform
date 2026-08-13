import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Stratxcel Workspace",
  description: "Sign in to your Stratxcel Business Growth Audit workspace.",
  robots: { index: false, follow: true },
};

export default async function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg text-sx-text">
      <PublicHeader />
      <main className="flex-1 flex items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl w-full grid gap-10 lg:grid-cols-2 items-center">
          {/* Left Panel: Desktop Brand Workflow & UI Preview */}
          <div className="hidden lg:flex flex-col justify-center space-y-6 pr-6 border-r border-sx-border">
            <span className="inline-block w-max rounded-sx-pill border border-sx-accent/40 bg-sx-accent/10 px-3.5 py-1 font-sx-mono text-[11px] font-semibold uppercase tracking-widest text-sx-accent">
              Stratxcel Secure SaaS Sign-In
            </span>
            <h2 className="font-sx-sans text-3xl font-extrabold tracking-tight text-sx-text">
              Return to your Business Growth Audit.
            </h2>
            <p className="font-sx-sans text-sm text-sx-text-muted leading-relaxed">
              Continue your guided intake, track automatic analysis progress, and open your written roadmap when it is ready.
            </p>

            {/* Security/product messaging — no per-account numbers here; those
                are real customer data and this page renders before any
                session exists, so nothing on it should look like a metric. */}
            <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between text-xs border-b border-sx-border pb-2">
                <span className="font-sx-mono font-bold text-sx-accent">Your workspace</span>
                <span className="text-emerald-400 font-semibold">● Multi-Tenant Isolated</span>
              </div>
              <ul className="space-y-2 text-xs text-sx-text-muted">
                <li className="flex items-start gap-2">
                  <span className="text-sx-accent font-bold">✓</span>
                  <span>Database-level tenant isolation (Supabase RLS)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sx-accent font-bold">✓</span>
                  <span>Automatic Audit analysis with a clear delivery status</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sx-accent font-bold">✓</span>
                  <span>Your intake and delivered report stay in your workspace</span>
                </li>
              </ul>
            </div>

            <div className="text-xs text-sx-text-subtle flex gap-4">
              <Link href="/audit" className="text-sx-accent underline hover:text-sx-accent/80">
                Explore the Audit →
              </Link>
              <Link href="/security" className="hover:text-sx-text">
                Security
              </Link>
            </div>
          </div>

          {/* Right Panel: Auth Form */}
          <div className="w-full max-w-md mx-auto">
            <span className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-accent">Account Sign In</span>
            <h1 className="mt-2 font-sx-sans text-2xl font-extrabold tracking-tight text-sx-text sm:text-3xl">
              Welcome back to Stratxcel
            </h1>
            <p className="mt-1 font-sx-sans text-xs text-sx-text-muted">
              Enter your credentials to access your organization&rsquo;s workspace.
            </p>

            <Card variant="panel" className="mt-6 p-6 sm:p-8 border-sx-border shadow-2xl">
              <LoginForm />
            </Card>

            <p className="mt-6 text-center font-sx-sans text-xs text-sx-text-muted">
              New to Stratxcel?{" "}
              <Link href="/signup" className="font-bold text-sx-accent hover:underline">
                Start with Stratxcel
              </Link>
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
