"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
import { ModulePageHeader } from "../components/ModulePageHeader";
import { ActionUnavailableNotice } from "../components/DisconnectedState";
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
 * Real tenant_members for this workspace (see app/api/platform/team/route.ts).
 * Invitation and role-change controls are shown but disabled — inviteMember()
 * exists server-side but has no token/email-based invite model yet, and no
 * role-mutation route exists, so neither can honestly claim to work.
 */
export default function TeamPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
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
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-sx-text">
                        {m.email ?? "Email not available"}
                        {m.userId === currentUserId && <span className="ml-1.5 text-xs text-sx-text-subtle">(you)</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-sx-text-subtle">{ROLE_EXPLANATION[m.role] ?? "—"}</p>
                      <p className="mt-0.5 text-[10.5px] text-sx-text-subtle">Joined {new Date(m.createdAt).toLocaleDateString()}</p>
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
        <p className="mt-1 text-xs text-sx-text-muted">This feature is being prepared for your workspace — invitation setup is pending.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" disabled className="flex-1" />
          <Button type="button" disabled>
            Send invite
          </Button>
        </div>
        <div className="mt-2">
          <ActionUnavailableNotice reason="Invitation setup is pending for your workspace." />
        </div>
      </Card>

      <Card variant="alert">
        <CardHeading>Security note</CardHeading>
        <p className="mt-1 text-xs text-sx-text-muted">
          Access is scoped per role and re-verified on every request server-side — no client-supplied tenant ID or role is ever trusted directly. Role
          changes aren&apos;t available yet; contact Stratxcel support if a role needs to change.
        </p>
      </Card>
    </div>
  );
}
