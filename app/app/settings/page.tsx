"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { signOutAction } from "../actions";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { ActionUnavailableNotice } from "../components/DisconnectedState";
import { Card, CardHeading, CardRow } from "@/components/ui/Card";
import { Field, Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Settings composes real, already-wired sub-surfaces (Brand Brain,
 * Integrations) rather than duplicating their storage, and keeps every
 * field with no backing schema as an explicitly-labeled local draft —
 * never implying a save that doesn't happen server-side. Only name/slug
 * exist on the tenants row today, and even those have no PATCH route yet
 * (creation-only via /api/platform/tenants), so this pass has zero
 * server-persisted fields — all drafts, honestly labeled.
 */
export default function SettingsPage() {
  const { active } = useCurrentTenant();
  const [email, setEmail] = useState<string | null>(null);

  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [language, setLanguage] = useState("en");
  const [workingHours, setWorkingHours] = useState("9:00 AM – 6:00 PM");
  const [approvalPref, setApprovalPref] = useState("manual");
  const [notifyMissions, setNotifyMissions] = useState(true);
  const [notifyApprovals, setNotifyApprovals] = useState(true);
  const [notifyBilling, setNotifyBilling] = useState(true);

  useEffect(() => {
    async function loadEmail() {
      const { data } = await createSupabaseBrowserClient().auth.getUser();
      setEmail(data.user?.email ?? null);
    }
    loadEmail();
  }, []);

  const businessProfileTab = (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeading>Workspace identity</CardHeading>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Workspace name">
            <Input value={active?.name ?? ""} disabled />
          </Field>
          <Field label="Slug">
            <Input value={active?.slug ?? ""} disabled />
          </Field>
        </div>
        <p className="mt-2 text-[10.5px] text-sx-text-subtle">Set at workspace creation. Editing name/slug after creation isn&apos;t supported yet.</p>
      </Card>

      <Card variant="nested">
        <CardHeading>Additional profile fields (draft only — not saved)</CardHeading>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Website">
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, Country" />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <p className="mt-2 text-[10.5px] text-sx-text-subtle">
          These fields have no server schema yet — this draft is kept only in this browser tab and is not sent anywhere.
        </p>
      </Card>

    </div>
  );

  const brandBrainTab = (
    <Card>
      <CardHeading>Brand Brain</CardHeading>
      <p className="mt-1 text-xs text-sx-text-muted">
        Industry, tone of voice, target audience, pillars, and rules live in Brand Brain — the same versioned context every mission is compiled against.
        Edited there, not duplicated here.
      </p>
      <Link href="/app/brand" className="mt-2 inline-block text-xs text-sx-accent hover:underline">
        Open Brand Brain →
      </Link>
    </Card>
  );

  const preferencesTab = (
    <div className="flex flex-col gap-4">
      <Card variant="nested">
        <CardHeading>Workspace preferences (draft only — not saved)</CardHeading>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Timezone">
            <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="UTC">UTC</option>
              <option value="America/New_York">America/New_York</option>
              <option value="Europe/London">Europe/London</option>
            </Select>
          </Field>
          <Field label="Language">
            <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </Select>
          </Field>
          <Field label="Working hours">
            <Input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          </Field>
          <Field label="Approval preference">
            <Select value={approvalPref} onChange={(e) => setApprovalPref(e.target.value)}>
              <option value="manual">Review every mission manually</option>
              <option value="auto_low_cost">Auto-approve low-cost missions</option>
            </Select>
          </Field>
        </div>
        <p className="mt-2 text-[10.5px] text-sx-text-subtle">No preferences backend exists yet — nothing here is persisted server-side.</p>
      </Card>
    </div>
  );

  const notificationsTab = (
    <Card variant="nested">
      <CardHeading>Notifications (draft only — not saved)</CardHeading>
      <div className="mt-2 flex flex-col gap-2 text-sm text-sx-text">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notifyMissions} onChange={(e) => setNotifyMissions(e.target.checked)} /> Mission state changes
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notifyApprovals} onChange={(e) => setNotifyApprovals(e.target.checked)} /> New approvals pending
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notifyBilling} onChange={(e) => setNotifyBilling(e.target.checked)} /> Wallet and billing alerts
        </label>
      </div>
      <p className="mt-2 text-[10.5px] text-sx-text-subtle">No notification-delivery backend exists yet — these preferences aren&apos;t saved or acted on.</p>
    </Card>
  );

  const securityTab = (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeading>Account</CardHeading>
        <CardRow>
          <span className="text-sx-text-muted">Email</span>
          <span>{email ?? "Loading…"}</span>
        </CardRow>
        <CardRow>
          <span className="text-sx-text-muted">Role in this workspace</span>
          <span>{active?.role ?? "—"}</span>
        </CardRow>
        <CardRow>
          <span className="text-sx-text-muted">Active sessions</span>
          <span>Not available</span>
        </CardRow>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Link href="/forgot-password">
          <Button variant="secondary" size="sm">
            Reset password
          </Button>
        </Link>
        <form action={signOutAction}>
          <Button type="submit" variant="danger" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );

  const integrationsTab = (
    <Card>
      <CardHeading>Integrations</CardHeading>
      <p className="mt-1 text-xs text-sx-text-muted">Manage connected services from the dedicated Integrations page.</p>
      <Link href="/app/integrations" className="mt-2 inline-block text-xs text-sx-accent hover:underline">
        Open Integrations →
      </Link>
    </Card>
  );

  const accountTab = (
    <Card>
      <CardHeading>Account</CardHeading>
      <CardRow>
        <span className="text-sx-text-muted">Email</span>
        <span>{email ?? "Loading…"}</span>
      </CardRow>
      <CardRow>
        <span className="text-sx-text-muted">Workspace</span>
        <span>{active?.name ?? "—"}</span>
      </CardRow>
    </Card>
  );

  const dataExportTab = (
    <Card>
      <CardHeading>Data and export</CardHeading>
      <p className="mt-1 text-xs text-sx-text-muted">Export isn&apos;t implemented yet for this workspace.</p>
      <div className="mt-2 flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled>
          Request data export
        </Button>
        <ActionUnavailableNotice reason="Data export isn't available yet." />
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Settings" tenantName={active?.name} />
      <Tabs
        items={[
          { key: "business", label: "Business profile", content: businessProfileTab },
          { key: "brand", label: "Brand Brain", content: brandBrainTab },
          { key: "preferences", label: "Workspace preferences", content: preferencesTab },
          { key: "notifications", label: "Notifications", content: notificationsTab },
          { key: "security", label: "Security", content: securityTab },
          { key: "integrations", label: "Integrations", content: integrationsTab },
          { key: "account", label: "Account", content: accountTab },
          { key: "data", label: "Data and export", content: dataExportTab },
        ]}
      />
    </div>
  );
}
