import Link from "next/link";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Stratxcel",
  description: "Sign in to your Stratxcel workspace.",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">Sign in</p>
          <h1 className="mt-3 font-sx-sans text-2xl font-semibold tracking-[-0.02em] text-sx-text sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-2 font-sx-sans text-[13.5px] leading-relaxed text-sx-text-muted">
            Sign in to your Stratxcel workspace.
          </p>

          <Card variant="panel" className="mt-8 p-6 sm:p-7">
            <LoginForm />
          </Card>

          <p className="mt-6 text-center font-sx-sans text-[13px] text-sx-text-muted">
            New to Stratxcel?{" "}
            <Link href="/signup" className="font-medium text-sx-accent hover:underline">
              Create an account
            </Link>
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
