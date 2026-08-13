"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardHeading } from "@/components/ui/Card";

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error">("idle");
  const [message, setMessage] = useState("This invite is tenant-scoped, single-use, and expires.");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function accept() {
      setStatus("working");
      const response = await fetch("/api/platform/team/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (cancelled) return;
      if (response.status === 401) {
        setStatus("error");
        setMessage("Sign in with the invited email, then open this link again.");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        setMessage(body.error ?? "This invite could not be accepted.");
        return;
      }
      setStatus("ok");
      setMessage("Invite accepted. Opening your workspace…");
      router.replace("/app/team");
    }
    void accept();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
      <Card className="w-full p-6">
        <CardHeading>Workspace invite</CardHeading>
        <p className="mt-2 text-sm text-sx-text-muted">{message}</p>
        {status === "error" && (
          <Button className="mt-4" onClick={() => router.push("/app")}>Sign in</Button>
        )}
      </Card>
    </main>
  );
}
