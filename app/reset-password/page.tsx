import { Suspense } from "react";
import type { Metadata } from "next";
import { PublicHeader } from "@/app/components/PublicHeader";
import { PublicFooter } from "@/app/components/PublicFooter";
import { Card } from "@/components/ui/Card";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata: Metadata = {
  title: "Set a new password — Stratxcel",
  description: "Set a new password for your Stratxcel account.",
  robots: { index: false, follow: true },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-sx-bg">
      <PublicHeader />
      <main className="flex-1">
        <section className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:px-6 sm:py-24">
          <p className="font-sx-mono text-[11px] uppercase tracking-[0.3em] text-sx-text-subtle">
            Password reset
          </p>
          <h1 className="mt-3 font-sx-sans text-2xl font-semibold tracking-[-0.02em] text-sx-text sm:text-3xl">
            Set a new password
          </h1>

          <Card variant="panel" className="mt-8 p-6 sm:p-7">
            <Suspense
              fallback={
                <p role="status" className="font-sx-sans text-sm text-sx-text-muted">
                  Loading…
                </p>
              }
            >
              <ResetPasswordForm />
            </Suspense>
          </Card>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
