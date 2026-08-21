"use client";

/**
 * Isolated demo harness for the real Growth Assistant surface — same pattern
 * as app/test-onboarding-canonical/page.tsx. Renders the actual production
 * chat, candidate-carousel, and publish-receipt components
 * (app/app/social/copilot/GrowthAssistantChat.tsx) with static demo data
 * instead of a live tenant session, so the public site's product-evidence
 * screenshots can be captured from the real design without touching live
 * AI generation, auth, or a real tenant's data. Not linked from any nav.
 */

import { BotAvatar, ReceiptCard, CandidateCarousel } from "@/app/app/social/copilot/GrowthAssistantChat";
import { SxAgentMarkdown } from "@/app/app/social/copilot/SxAgentMarkdown";
import { PlatformIcon } from "@/components/audit/PlatformIcon";

function ChatShell({
  children,
  historyLabel = "व्यापार सहायक · Ask me to help grow your business",
}: {
  children: React.ReactNode;
  historyLabel?: string;
}) {
  return (
    <div className="sx-customer-app mx-auto flex h-[640px] w-full max-w-[420px] flex-col overflow-hidden rounded-sx-lg border border-sx-border bg-sx-bg">
      <div className="flex shrink-0 items-center justify-between border-b border-sx-border bg-sx-surface-1 px-4 py-3">
        <div>
          <p className="text-[17px] font-bold text-sx-text">Growth Assistant</p>
          <p className="mt-0.5 text-xs text-sx-text-subtle">{historyLabel}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-sx-sm bg-sx-accent-muted text-sx-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h12" />
          </svg>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3.5">{children}</div>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-end justify-end gap-2">
      <div className="max-w-[280px] rounded-[14px_4px_14px_14px] bg-sx-accent px-3.5 py-2.5 text-[14px] leading-relaxed text-sx-accent-on sm:max-w-[340px]">
        {text}
      </div>
    </div>
  );
}

function BotBubble({ content }: { content: string }) {
  return (
    <div className="flex items-end justify-start gap-2">
      <BotAvatar />
      <div className="max-w-[300px] rounded-[4px_14px_14px_14px] border border-sx-border bg-sx-surface-1 px-3.5 py-2.5 text-[14px] leading-relaxed sm:max-w-[420px]">
        <SxAgentMarkdown content={content} />
      </div>
    </div>
  );
}

const WorkingIndicator = () => (
  <div className="flex items-center gap-2 rounded-sx-md border border-sx-border bg-sx-surface-1 px-3.5 py-3">
    <span className="h-2 w-2 rounded-full bg-sx-accent sx-status-pulse" />
    <span className="text-[13px] text-sx-text-muted">Working on it…</span>
  </div>
);

// Screen 5 — Growth Assistant conversation.
function ScreenGrowthAssistant() {
  return (
    <ChatShell>
      <UserBubble text="Create a festive discount poster for my bakery, in Hindi and English" />
      <BotBubble content="Sure — I'll use your brand colors and current weekend offer. Generating a couple of options now." />
      <WorkingIndicator />
    </ChatShell>
  );
}

// Screen 6 — Generated content / poster candidates.
function ScreenGeneratedContent() {
  return (
    <ChatShell>
      <UserBubble text="Create a festive discount poster for my bakery, in Hindi and English" />
      <BotBubble content="Here are two poster options for your weekend sale:" />
      <CandidateCarousel
        jobId="demo-job"
        candidates={[
          { candidateId: "demo-1", previewUrl: null, format: "1:1 Social Poster", status: "PENDING" },
          { candidateId: "demo-2", previewUrl: null, format: "1:1 Social Poster", status: "PENDING" },
        ]}
        onSelectCandidate={async () => {}}
      />
    </ChatShell>
  );
}

// Screen 7 — Approval ("Ready to publish"), same card design as
// app/app/social/copilot/PublishReviewCard.tsx's single-platform state,
// with static demo copy instead of a live server-action fetch.
function ScreenApproval() {
  return (
    <ChatShell>
      <UserBubble text="The second one — please get it ready to post" />
      <BotBubble content="Good choice. Here's the caption I've drafted — take a look before it goes out." />
      <div className="overflow-hidden rounded-sx-lg border border-sx-border bg-sx-surface-1">
        <div className="flex items-center justify-between border-b border-sx-border px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sx-xs bg-sx-accent-muted">
              <PlatformIcon name="instagram" className="h-3.5 w-3.5" />
            </span>
            <span>
              <span className="block text-[13px] font-bold text-sx-text">Instagram</span>
              <span className="block text-[11px] text-sx-text-subtle">@yourbakery</span>
            </span>
          </div>
          <span className="rounded-sx-xs bg-sx-warning/10 px-2 py-1 text-[11px] font-semibold text-sx-warning">
            Ready to publish
          </span>
        </div>
        <div className="border-b border-sx-border px-3.5 py-3">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-sx-text">
            Weekend special is here! Fresh-baked, festive, and ready for your table. Visit us before it&apos;s gone. 🎉
          </p>
          <p className="mt-1.5 text-xs text-sx-text-subtle">#WeekendSpecial #FreshBaked #ShopLocal</p>
          <p className="mt-1.5 text-xs text-sx-text-subtle">Visibility · Public</p>
        </div>
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-[13px] text-sx-text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Schedule
          </span>
          <span className="text-[13px] font-semibold text-sx-text">Post now</span>
        </div>
        <div className="flex gap-2 px-3.5 pb-3.5 pt-1">
          <span className="flex h-10 items-center justify-center rounded-sx-sm border-[1.5px] border-sx-border px-3 text-[13px] font-semibold text-sx-text-muted">
            Cancel
          </span>
          <span className="flex h-10 items-center justify-center rounded-sx-sm border-[1.5px] border-sx-border px-3 text-[13px] font-semibold text-sx-text-muted">
            Edit
          </span>
          <span className="flex h-10 flex-1 items-center justify-center gap-1 rounded-sx-sm bg-sx-accent text-[13px] font-bold text-sx-accent-on">
            Approve &amp; Publish
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </ChatShell>
  );
}

// Screen 8 — Published result.
function ScreenPublished() {
  return (
    <ChatShell>
      <UserBubble text="Approve & Publish" />
      <ReceiptCard
        receipt={{
          platform: "instagram",
          accountLabel: "@yourbakery",
          publishedAt: new Date().toISOString(),
        }}
      />
      <BotBubble content="Done — that's live now. I'll let you know how it performs." />
    </ChatShell>
  );
}

export default function TestGrowthAssistantCanonicalPage() {
  return (
    <div className="min-h-screen bg-sx-surface-0 p-8 text-sx-text">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-center gap-8">
        <section id="screen-growth-assistant">
          <ScreenGrowthAssistant />
        </section>
        <section id="screen-generated-content">
          <ScreenGeneratedContent />
        </section>
        <section id="screen-approval">
          <ScreenApproval />
        </section>
        <section id="screen-published">
          <ScreenPublished />
        </section>
      </div>
    </div>
  );
}
