"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type EmailState =
  | { status: "loading"; email: null }
  | { status: "success"; email: string | null }
  | { status: "error"; email: null };

/**
 * V1 settings expose only persisted identity and supported account actions.
 * Unsupported preferences, integrations, and notification controls are not
 * rendered as editable fields that imply functionality that does not exist.
 */
export default function SettingsPage() {
  const { active } = useCurrentTenant();
  const [emailState, setEmailState] = useState<EmailState>({ status: "loading", email: null });

  useEffect(() => {
    let current = true;
    async function loadEmail() {
      try {
        const { data, error } = await createSupabaseBrowserClient().auth.getUser();
        if (!current) return;
        if (error) {
          setEmailState({ status: "error", email: null });
          return;
        }
        setEmailState({ status: "success", email: data.user?.email ?? null });
      } catch {
        if (current) setEmailState({ status: "error", email: null });
      }
    }
    void loadEmail();
    return () => {
      current = false;
    };
  }, []);

  const emailLabel =
    emailState.status === "loading"
      ? "Loading…"
      : emailState.status === "error"
        ? "Unavailable"
        : emailState.email ?? "Not available";

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Settings" tenantName={active?.name} description="Workspace identity and account security." />

      <Card>
        <div className="flex items-center justify-between">
          <CardHeading>Business Profile</CardHeading>
          <Link href="/app/brand">
            <Button variant="secondary" size="sm">
              Edit in Brand Brain →
            </Button>
          </Link>
        </div>
        <p className="mt-1.5 text-xs text-sx-text-muted">
          Your canonical business identity, website, location, positioning, and verified channels.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Business name">
            <Input value={active?.name ?? ""} disabled />
          </Field>
          <Field label="Workspace slug">
            <Input value={active?.slug ?? ""} disabled />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeading>Account security</CardHeading>
        <CardRow>
          <span className="text-sx-text-muted">Email</span>
          <span>{emailLabel}</span>
        </CardRow>
        <CardRow>
          <span className="text-sx-text-muted">Role in this workspace</span>
          <span className="capitalize">{active?.role ?? "Staff support"}</span>
        </CardRow>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/forgot-password">
            <Button variant="secondary" size="sm">
              Reset password
            </Button>
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeading>Appearance</CardHeading>
        <CardRow>
          <span className="text-sx-text-muted">Theme</span>
          <ThemeToggle />
        </CardRow>
      </Card>
    </div>
  );
}
