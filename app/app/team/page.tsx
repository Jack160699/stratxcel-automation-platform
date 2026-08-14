"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { Card, CardHeading } from "@/components/ui/Card";
import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState, ErrorState } from "@/components/ui/Feedback";
import { loadCustomerJson } from "@/lib/customer-app/load-result";

interface TeamMember {
  userId: string;
  role: string;
  email: string | null;
  createdAt: string;
}

const ROLE_CHIP: Record<string, { label: string; state: ChipState }> = {
  owner: { label: "Owner", state: "accent" },
  admin: { label: "Admin", state: "ai" },
  operator: { label: "Operator", state: "success" },
  viewer: { label: "Viewer", state: "neutral" },
};

const ROLE_EXPLANATION: Record<string, string> = {
  owner: "Full access, including member management and billing.",
  admin: "Manages missions, approvals, wallet, and integrations. Cannot manage members.",
  operator: "Creates and cancels missions, assists with handoffs. No wallet top-up/spend access.",
  viewer: "Read-only access to Brand Brain, missions, and wallet balance.",
};

/**
 * Real tenant_members for this workspace. Invites are tenant-scoped,
 * hashed, expiring, single-use, and role-constrained. Email delivery is
 * optional; the invite link can be copied.
 */
export default function TeamPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const loadSequence = useRef(0);

  async function load() {
    if (!tenantId) return;
    const requestId = ++loadSequence.current;
    setLoading(true);
    setError(null);
    setMembers(null);
    setCurrentUserId(null);
    const result = await loadCustomerJson<{ members?: TeamMember[]; currentUserId?: string | null }>(
      () => fetch(`/api/platform/team?tenantId=${encodeURIComponent(tenantId)}`),
      "We couldn't load your team. Please try again."
    );
    if (requestId !== loadSequence.current) return;
    setLoading(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setMembers(result.data.members ?? []);
    setCurrentUserId(result.data.currentUserId ?? null);
  }

  async function createInvite() {
    if (!tenantId || !inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = await response.json() as { inviteUrl?: string; error?: string };
      if (!response.ok || !body.inviteUrl) {
        setError(body.error ?? "Could not create invite.");
        return;
      }
      setInviteUrl(body.inviteUrl);
    } finally {
      setInviting(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div className="flex flex-col gap-6">
      <ModulePageHeader title="Team" tenantName={active?.name} description="Everyone with access to this workspace." />

      {error && <ErrorState message={error} onRetry={load} />}

      <section className="flex flex-col gap-3">
        {tenantId && loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {!loading && !error && members?.length === 0 && (
          <EmptyState title="No team members found." subtitle="Your workspace membership is active, but no member directory entries were returned." />
        )}
        {members && members.length > 0 && (
          <div className="flex flex-col gap-2">
            {members.map((m) => {
              const chip = ROLE_CHIP[m.role] ?? { label: m.role, state: "neutral" as ChipState };
              return (
                <Card key={m.userId} variant="nested">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sx-surface-3 text-xs font-semibold text-sx-text">
                        {(m.email ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-sx-text">
                        {m.email ?? "Email not available"}
                        {m.userId === currentUserId && <span className="ml-1.5 text-xs text-sx-text-subtle">(you)</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-sx-text-subtle">{ROLE_EXPLANATION[m.role] ?? "—"}</p>
                      <p className="mt-0.5 text-[10.5px] text-sx-text-subtle">Joined {new Date(m.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <StatusChip state={chip.state}>{chip.label}</StatusChip>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeading>Invite a team member</CardHeading>
        <p className="mt-1 text-xs text-sx-text-muted">Creates a secure, expiring, single-use invite link. Copy it if email delivery is unavailable.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" className="sm:flex-1" />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="min-h-11 rounded-sx-sm border border-sx-border-strong bg-sx-surface-1 px-2 text-sm"
          >
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <Button className="min-h-11" type="button" onClick={() => void createInvite()} disabled={!tenantId || inviting || !inviteEmail.trim()}>
            {inviting ? "Creating…" : "Generate invite"}
          </Button>
        </div>
        {inviteUrl && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={inviteUrl} className="sm:flex-1" />
            <Button className="min-h-11" type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy invite link</Button>
          </div>
        )}
      </Card>

      <Card variant="alert">
        <CardHeading>Security note</CardHeading>
        <p className="mt-1 text-xs text-sx-text-muted">
          Role changes stay owner-only on the server. The last owner cannot be removed or demoted.
        </p>
      </Card>
    </div>
  );
}
