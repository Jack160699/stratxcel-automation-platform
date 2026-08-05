import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Reset your password — Stratxcel",
  description: "Request a password reset link for your Stratxcel account.",
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">
            Password reset
          </p>
          <h1 className="mt-3 font-sx-sans text-2xl font-semibold tracking-[-0.02em] text-sx-text sm:text-3xl">
            Forgot your password?
          </h1>
          <p className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
            Enter your email and we&rsquo;ll send you a link to reset it.
          </p>

          <Card variant="panel" className="mt-8 p-6 sm:p-7">
            <ForgotPasswordForm />
          </Card>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
