"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCurrentTenant } from "../CurrentTenantContext";
import { MissionSummaryCard, type MissionSummary } from "../components/MissionSummaryCard";
import { ApprovalSummary, type ApprovalSummaryItem } from "../components/ApprovalSummary";
import { ArtifactCard, type ArtifactSummary } from "../components/ArtifactCard";
import { Card, CardHeading } from "@/components/ui/Card";
import { CopilotChat } from "@/components/agent-core/CopilotChat";
import { loadClientCopilotThreadAction, sendClientCopilotMessageAction } from "./actions";

type CopilotTab = "ask" | "missions" | "activity";

const SUGGESTED_CHIPS = [
  "Create a festival poster",
  "Write a social post for Instagram",
  "Improve my local SEO rankings",
  "Find growth opportunities",
  "Review my business audit",
];

const NON_TERMINAL_STATES = new Set([
  "DRAFT",
  "ESTIMATING",
  "AWAITING_FUNDS",
  "READY",
  "QUEUED",
  "RUNNING",
  "AWAITING_INPUT",
  "AWAITING_APPROVAL",
  "HUMAN_HANDOFF",
  "RESUMED",
]);

export default function CopilotPage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;

  const [activeTab, setActiveTab] = useState<CopilotTab>("ask");
  const [goalText, setGoalText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [planName, setPlanName] = useState<string>("Free");
  const [walletBalance, setWalletBalance] = useState<number>(0);

  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [missionsError, setMissionsError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalSummaryItem[] | null | "forbidden">(null);
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null | "unavailable">(null);

  // Load tenant subscription & entitlements
  useEffect(() => {
    if (!tenantId) return;
    async function loadSubscription() {
      try {
        const res = await fetch(`/api/platform/subscriptions?tenantId=${encodeURIComponent(tenantId!)}`);
        if (res.ok) {
          const data = await res.json();
          const sub = data.subscription;
          const status = (sub?.status || "free").toLowerCase();
          const activePaid = status === "active" || status === "authenticated";
          setIsSubscribed(activePaid);
          setPlanName(activePaid ? (sub?.plan_tier ? sub.plan_tier.toUpperCase() : "GROWTH") : "Free");
        } else {
          setIsSubscribed(false);
        }
      } catch {
        setIsSubscribed(false);
      }
    }

    async function loadWallet() {
      try {
        const res = await fetch(`/api/platform/wallet?tenantId=${encodeURIComponent(tenantId!)}`);
        if (res.ok) {
          const data = await res.json();
          setWalletBalance(data.wallet?.balance_cents ? data.wallet.balance_cents / 100 : 0);
        }
      } catch {
        setWalletBalance(0);
      }
    }

    loadSubscription();
    loadWallet();
    loadMissions();
    loadApprovals();
    loadArtifacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadMissions() {
    if (!tenantId) return;
    setMissionsError(null);
    try {
      const res = await fetch(`/api/platform/missions?tenantId=${encodeURIComponent(tenantId)}`);
      const body = await res.json();
      if (!res.ok) {
        setMissionsError(body.error ?? `Failed to load missions (HTTP ${res.status})`);
        return;
      }
      setMissions(body.missions);
    } catch {
      setMissions([]);
    }
  }

  async function loadApprovals() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/platform/approvals?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.status === 403) {
        setApprovals("forbidden");
        return;
      }
      const body = await res.json();
      if (!res.ok) return;
      setApprovals(body.approvals);
    } catch {
      setApprovals([]);
    }
  }

  async function loadArtifacts() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/platform/artifacts?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) {
        setArtifacts("unavailable");
        return;
      }
      const body = await res.json();
      setArtifacts(body.artifacts);
    } catch {
      setArtifacts("unavailable");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !goalText.trim()) return;

    // Plan requirement gate for free users
    if (!isSubscribed) {
      setSubmitError(
        "This action needs an active plan. Your wallet: ₹0. Activate a plan to start autonomous execution."
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/platform/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, goalText: goalText.trim() }),
      });
      const body = await res.json();
      if (body.status === "ENGINEERING_REQUIRED" && body.brief) {
        setSubmitError(`${body.brief.title}. ${body.brief.summary}`);
        return;
      }
      if (body.status === "APPROVAL_REQUIRED") {
        setSubmitError(body.message ?? "Owner approval is required before this can run.");
        return;
      }
      if (!res.ok) {
        setSubmitError(body.error ?? `Failed to create mission (HTTP ${res.status})`);
        return;
      }
      setGoalText("");
      await loadMissions();
      setActiveTab("missions");
    } finally {
      setSubmitting(false);
    }
  }

  const runningMissions = (missions ?? []).filter((m) => NON_TERMINAL_STATES.has(m.state));
  const completedMissions = (missions ?? []).filter((m) => !NON_TERMINAL_STATES.has(m.state));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 sm:gap-5 pb-20 md:pb-8">
      {/* 1. Header & Plan Context */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-sx-border/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-sx-text">
            AI Copilot
          </h1>
          <p className="mt-0.5 text-[14px] text-sx-text-muted">
            {isSubscribed
              ? `${planName} Plan Active · Autonomous growth & content execution`
              : "Autonomous marketing and operations agent for your business"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSubscribed ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sx-success/15 px-3 py-1 text-[12px] font-bold text-sx-success">
              ● Active {planName}
            </span>
          ) : (
            <Link
              href="/app/billing"
              className="inline-flex min-h-[38px] items-center rounded-full bg-sx-accent/15 px-3.5 text-[12px] font-bold text-sx-accent hover:bg-sx-accent/20 transition-colors"
            >
              Unlock Execution →
            </Link>
          )}
        </div>
      </div>

      {/* 2. 3-Tab Mobile Navigation */}
      <div className="grid grid-cols-3 rounded-sx-md border border-sx-border bg-sx-surface-1 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("ask")}
          className={`min-h-[42px] rounded-sx-sm text-[14px] font-bold transition-colors ${
            activeTab === "ask"
              ? "bg-sx-accent text-sx-accent-on shadow-sm"
              : "text-sx-text-muted hover:text-sx-text"
          }`}
        >
          Ask
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("missions")}
          className={`min-h-[42px] rounded-sx-sm text-[14px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "missions"
              ? "bg-sx-accent text-sx-accent-on shadow-sm"
              : "text-sx-text-muted hover:text-sx-text"
          }`}
        >
          <span>Missions</span>
          {runningMissions.length > 0 && (
            <span className="rounded-full bg-sx-success px-1.5 py-0.2 text-[10px] text-white font-black">
              {runningMissions.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("activity")}
          className={`min-h-[42px] rounded-sx-sm text-[14px] font-bold transition-colors ${
            activeTab === "activity"
              ? "bg-sx-accent text-sx-accent-on shadow-sm"
              : "text-sx-text-muted hover:text-sx-text"
          }`}
        >
          Activity
        </button>
      </div>

      {/* 3. TAB 1: ASK */}
      {activeTab === "ask" && (
        <div className="flex flex-col gap-4">
          {/* Free User Informational Banner */}
          {!isSubscribed && (
            <div className="rounded-sx-md border border-sx-accent/30 bg-sx-accent/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-bold text-sx-text">
                    Copilot is ready for your business
                  </p>
                  <p className="mt-0.5 text-[13px] text-sx-text-muted leading-relaxed">
                    You can ask questions and explore growth ideas. Starting ongoing missions requires an active subscription.
                  </p>
                </div>
                <Link
                  href="/app/billing"
                  className="inline-flex min-h-[36px] items-center rounded-sx-sm bg-sx-accent px-3 text-[12px] font-bold text-sx-accent-on shrink-0"
                >
                  View Plans
                </Link>
              </div>
            </div>
          )}

          {/* Quick Suggested Prompt Chips */}
          <div>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-sx-text-subtle">
              Suggested tasks
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setGoalText(chip)}
                  className="rounded-full border border-sx-border bg-sx-surface-1 px-3.5 py-1.5 text-[13px] font-medium text-sx-text hover:border-sx-accent hover:text-sx-accent transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt / Mission Input Box */}
          <Card className="p-4 sm:p-5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label htmlFor="goal-input" className="text-[14px] font-bold text-sx-text">
                What do you want to do today?
              </label>
              <textarea
                id="goal-input"
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                placeholder="e.g. Create a high-converting festive poster for Instagram and schedule it for this Friday..."
                rows={3}
                className="w-full rounded-sx-md border border-sx-border bg-sx-surface-2 p-3 text-[15px] text-sx-text placeholder:text-sx-text-subtle focus:border-sx-accent focus:outline-none"
              />

              {submitError && (
                <div className="rounded-sx-md border border-sx-warning/40 bg-sx-warning/10 p-3 text-[13px] text-sx-warning leading-relaxed">
                  <p className="font-semibold">{submitError}</p>
                  {!isSubscribed && (
                    <div className="mt-2 flex gap-2">
                      <Link
                        href="/app/billing"
                        className="inline-flex min-h-[34px] items-center rounded-sx-sm bg-sx-accent px-3 text-[12px] font-bold text-sx-accent-on"
                      >
                        View Plans →
                      </Link>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-[12px] text-sx-text-muted">
                  {isSubscribed ? "Delegates to Hermes agent engine" : "Wallet: ₹0 · Plan: Free"}
                </p>
                <button
                  type="submit"
                  disabled={submitting || !goalText.trim()}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-sx-md bg-sx-accent px-5 text-[14px] font-bold text-sx-accent-on disabled:opacity-50 transition-transform active:scale-95"
                >
                  {submitting ? "Planning..." : isSubscribed ? "Start Mission →" : "Submit Goal"}
                </button>
              </div>
            </form>
          </Card>

          {/* Interactive Chat Stream */}
          {tenantId && (
            <CopilotChat
              title="Copilot Conversation"
              description="Ask questions about your business, SEO audit, or marketing schedule."
              placeholder="Ask anything about your business..."
              loadThread={() => loadClientCopilotThreadAction(tenantId)}
              sendMessage={(text) => sendClientCopilotMessageAction(tenantId, text)}
            />
          )}
        </div>
      )}

      {/* 4. TAB 2: MISSIONS */}
      {activeTab === "missions" && (
        <div className="flex flex-col gap-4">
          {!isSubscribed ? (
            <Card className="py-10 text-center">
              <span className="text-3xl">🔒</span>
              <h2 className="mt-3 text-lg font-bold text-sx-text">No active plan</h2>
              <p className="mx-auto mt-1 max-w-sm text-[14px] text-sx-text-muted leading-relaxed">
                Autonomous missions cannot start without an active subscription. Your wallet balance is ₹0.
              </p>
              <div className="mt-4">
                <Link
                  href="/app/billing"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-sx-md bg-sx-accent px-6 text-[14px] font-bold text-sx-accent-on shadow-md hover:bg-sx-accent/90"
                >
                  Choose a Plan →
                </Link>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Running Missions */}
              <div>
                <h2 className="mb-2.5 text-[15px] font-bold text-sx-text flex items-center gap-2">
                  <span>Running & Queued</span>
                  <span className="rounded-full bg-sx-success/15 px-2 py-0.5 text-[11px] font-bold text-sx-success">
                    {runningMissions.length}
                  </span>
                </h2>
                {runningMissions.length > 0 ? (
                  <div className="grid gap-3">
                    {runningMissions.map((m) => (
                      <MissionSummaryCard key={m.id} mission={m} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 text-center text-[13px] text-sx-text-muted">
                    No missions currently running. Ask Copilot to start a new growth campaign.
                  </div>
                )}
              </div>

              {/* Completed Missions */}
              <div>
                <h2 className="mb-2.5 text-[15px] font-bold text-sx-text flex items-center gap-2">
                  <span>Completed</span>
                  <span className="rounded-full bg-sx-surface-2 px-2 py-0.5 text-[11px] font-bold text-sx-text-muted">
                    {completedMissions.length}
                  </span>
                </h2>
                {completedMissions.length > 0 ? (
                  <div className="grid gap-3">
                    {completedMissions.map((m) => (
                      <MissionSummaryCard key={m.id} mission={m} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-5 text-center text-[13px] text-sx-text-muted">
                    Completed missions and deliverables will appear here.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. TAB 3: ACTIVITY */}
      {activeTab === "activity" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-2.5 text-[15px] font-bold text-sx-text">Recent Deliverables & Artifacts</h2>
            {artifacts && Array.isArray(artifacts) && artifacts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {artifacts.map((a) => (
                  <ArtifactCard key={a.id} artifact={a} />
                ))}
              </div>
            ) : (
              <div className="rounded-sx-md border border-sx-border bg-sx-surface-1 p-6 text-center text-[14px] text-sx-text-muted">
                <p className="font-semibold text-sx-text">Business audit & initial intelligence ready</p>
                <p className="mt-1 text-[13px]">
                  Generated campaign posters, SEO briefs, and reports will be archived here.
                </p>
                <Link
                  href="/app/audit"
                  className="mt-3 inline-flex min-h-[38px] items-center rounded-sx-sm bg-sx-surface-2 px-4 text-[13px] font-bold text-sx-accent hover:bg-sx-surface-3"
                >
                  View Business Audit →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
