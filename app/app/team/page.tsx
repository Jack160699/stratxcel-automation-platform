"use client";

import { useEffect, useRef, useState } from "react";
import { useCurrentTenant } from "../CurrentTenantContext";
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

/** Real 4-tier permission system — the StratXcel App reference's simpler Owner/Manager/Staff labels don't map 1:1 onto this, so the actual role names/permissions stay exactly as implemented rather than being renamed to match. */
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

function initialsFor(email: string | null): string {
  const source = email ?? "?";
  return source.slice(0, 2).toUpperCase();
}

/**
 * Real tenant_members for this workspace. Invites are tenant-scoped,
 * hashed, expiring, single-use, and role-constrained. Email delivery is
 * optional; the invite link can be copied — the reference's "Invite Staff
 * on WhatsApp" CTA isn't a real channel this system has, so the CTA stays
 * visually prominent (matching the reference) but honestly describes the
 * real copyable-link mechanism.
 */
export default function TeamPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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
    <div data-sx-ui="new-staff" className="sx-customer-app mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-20 md:pb-8">
      <div>
        <h1 className="text-2xl font-semibold text-sx-text">Staff{active ? ` · ${active.name}` : ""}</h1>
        <p className="sx-hi text-xs text-sx-text-subtle">कर्मचारी</p>
        <p className="mt-1 text-sm text-sx-text-muted">Everyone with access to this workspace.</p>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {/* Invite CTA — reference's prominent bar, real copyable-link invite behind it */}
      <button
        type="button"
        onClick={() => setInviteOpen((v) => !v)}
        className="flex h-12 items-center justify-center gap-2 rounded-sx-md bg-sx-success text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        <span className="text-lg leading-none">+</span> Invite a team member
      </button>

      {inviteOpen && (
        <Card className="p-4">
          <CardHeading>Invite a team member</CardHeading>
          <p className="mt-1 text-xs text-sx-text-muted">Creates a secure, expiring, single-use invite link. Share it however works for you — WhatsApp, email, SMS.</p>
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
            <Button className="min-h-11 text-sm" type="button" onClick={() => void createInvite()} disabled={!tenantId || inviting || !inviteEmail.trim()}>
              {inviting ? "Creating…" : "Generate invite"}
            </Button>
          </div>
          {inviteUrl && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={inviteUrl} className="sm:flex-1" />
              <Button className="min-h-11 text-sm" type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy invite link</Button>
            </div>
          )}
        </Card>
      )}

      {/* Member rows — StratXcel App reference row treatment */}
      <section className="flex flex-col gap-2.5">
        {tenantId && loading && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {!loading && !error && members?.length === 0 && (
          <EmptyState title="No team members found." subtitle="Your workspace membership is active, but no member directory entries were returned." />
        )}
        {members?.map((m) => {
          const chip = ROLE_CHIP[m.role] ?? { label: m.role, state: "neutral" as ChipState };
          const isOwner = m.role === "owner";
          return (
            <Card key={m.userId} className="p-3.5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                  style={isOwner ? { background: "linear-gradient(135deg, var(--sx-accent), #3b82f6)" } : { background: "var(--sx-surface-3)", color: "var(--sx-text-muted)" }}
                >
                  {initialsFor(m.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-sx-text">
                    {m.email ?? "Email not available"}
                    {m.userId === currentUserId && <span className="ml-1.5 text-xs font-normal text-sx-text-subtle">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-sx-text-subtle">Joined {new Date(m.createdAt).toLocaleDateString()}</p>
                </div>
                <StatusChip state={chip.state}>{chip.label}</StatusChip>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Roles legend — StratXcel App reference */}
      <Card className="p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Roles</p>
        <div className="flex flex-col gap-2">
          {(["owner", "admin", "operator", "viewer"] as const).map((role) => (
            <div key={role} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sx-accent" />
              <p className="text-[13px] text-sx-text">
                <span className="font-semibold capitalize">{role}</span> — {ROLE_EXPLANATION[role]}
              </p>
            </div>
          ))}
        </div>
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
