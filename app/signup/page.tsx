import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Create an account — Stratxcel",
  description: "Start your Stratxcel workspace.",
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Sign up</p>
          <h1 className="mt-3 font-sx-sans text-2xl font-semibold tracking-[-0.02em] text-sx-text sm:text-3xl">
            Start with Stratxcel
          </h1>
          <p className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
            Create your workspace in a minute.
          </p>

          <Card variant="panel" className="mt-8 p-6 sm:p-7">
            <SignupForm />
          </Card>

          <p className="mt-6 text-center font-sx-sans text-[13px] text-sx-text-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-sx-accent hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
