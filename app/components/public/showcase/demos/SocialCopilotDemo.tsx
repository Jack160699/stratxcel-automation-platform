import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { DashboardFrame } from "../DashboardFrame";
import { DEMO_APPROVAL, DEMO_SOCIAL_POSTS } from "../fixtures/showcase-data";

export function SocialCopilotDemo() {
  return (
    <DashboardFrame title="Content & approvals">
      <div className="flex flex-col gap-3">
        <header>
          <h2 className="font-sx-sans text-sm font-semibold text-sx-text">Weekly content mission</h2>
          <p className="mt-0.5 text-[10px] text-sx-text-muted">Drafts compiled from Brand Brain — review before scheduling.</p>
        </header>
        <div className="space-y-2">
          {DEMO_SOCIAL_POSTS.map((post) => (
            <Card key={post.title} variant="nested" className="!p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-sx-mono text-[9px] uppercase tracking-wider text-sx-accent">{post.day} · {post.format}</span>
                  <p className="mt-0.5 text-[11px] font-semibold text-sx-text">{post.title}</p>
                  <p className="mt-0.5 text-[10px] text-sx-text-subtle">{post.hook}</p>
                </div>
                <StatusChip state="neutral">Draft</StatusChip>
              </div>
            </Card>
          ))}
        </div>
        <div className="rounded-sx-md border border-[rgb(240_180_41_/_0.35)] bg-[rgb(240_180_41_/_0.08)] p-3">
          <div className="flex items-center justify-between gap-2">
            <StatusChip state="warning">Approval pending</StatusChip>
            <span className="font-sx-mono text-[9px] text-sx-text-subtle">Owner sign-off required</span>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-sx-text">{DEMO_APPROVAL.title}</p>
          <p className="mt-0.5 text-[10px] text-sx-text-muted">{DEMO_APPROVAL.platforms}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-sx-sm bg-sx-success px-2.5 py-1 font-sx-sans text-[10px] font-semibold text-sx-bg">Approve & schedule</span>
            <span className="rounded-sx-sm border border-sx-border px-2.5 py-1 font-sx-sans text-[10px] text-sx-text-muted">Request re-draft</span>
          </div>
        </div>
      </div>
    </DashboardFrame>
  );
}
