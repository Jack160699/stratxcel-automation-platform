"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";

export interface CopilotChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolName: string | null;
  createdAt: string;
}

export interface CopilotSendResult {
  ok: boolean;
  replyText: string;
  status: string;
  confirmationRequired: boolean;
}

export interface CopilotChatProps {
  title: string;
  description: string;
  placeholder: string;
  loadThread: () => Promise<{ messages: CopilotChatMessage[] } | { error: string }>;
  sendMessage: (text: string) => Promise<CopilotSendResult | { error: string }>;
}

/**
 * Shared chat UI for the admin and client web Copilots — a real thread,
 * input, agent replies, and pending-confirmation state. Deliberately plain:
 * this task's priority is functional parity between the web Copilot and the
 * WhatsApp Agent, not a new design system (see build brief PHASE 4/5).
 * Tool-role messages are shown as compact activity lines rather than full
 * chat bubbles, since their content is a raw JSON tool result.
 */
export function CopilotChat({ title, description, placeholder, loadThread, sendMessage }: CopilotChatProps) {
  const [messages, setMessages] = useState<CopilotChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const result = await loadThread();
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setMessages(result.messages);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    setInput("");
    try {
      const result = await sendMessage(text);
      if ("error" in result) {
        setSendError(result.error);
        return;
      }
      setPendingConfirmation(result.confirmationRequired);
      await refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-sx-sans text-base font-medium text-sx-text">{title}</h2>
        <p className="mt-1 text-xs text-sx-text-muted">{description}</p>
      </div>

      <div className="flex max-h-[520px] min-h-[220px] flex-col gap-3 overflow-y-auto rounded-sx-sm border border-sx-border-strong bg-sx-surface-2 p-3">
        {loadError && <ErrorState message={loadError} onRetry={refresh} />}
        {!loadError && messages === null && <p className="text-sm text-sx-text-subtle">Loading…</p>}
        {!loadError && messages && messages.length === 0 && <p className="text-sm text-sx-text-subtle">No messages yet — ask a question below.</p>}
        {messages?.map((message) => {
          if (message.role === "tool") {
            return (
              <p key={message.id} className="text-[11px] text-sx-text-subtle">
                ⚙ {message.toolName ?? "tool"} ran
              </p>
            );
          }
          const isUser = message.role === "user";
          return (
            <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-sx-md px-3 py-2 text-[13px] whitespace-pre-wrap ${
                  isUser ? "bg-sx-accent text-sx-on-accent" : "bg-sx-surface-3 text-sx-text"
                }`}
              >
                {message.content || <span className="italic text-sx-text-subtle">(no reply)</span>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {pendingConfirmation && (
        <Card variant="ai" className="text-xs text-sx-text-muted">
          This action needs confirmation before it runs. Reply with <code>CONFIRM &lt;code&gt;</code> (or <code>CANCEL &lt;code&gt;</code>) using the code shown above.
        </Card>
      )}

      <form onSubmit={handleSubmit} className="sticky bottom-[4.75rem] z-10 flex flex-col gap-2 border-t border-sx-border bg-sx-elevated pt-2 md:static md:bottom-auto md:border-0 md:bg-transparent md:pt-0">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} className="min-h-[70px]" disabled={sending} />
        <div className="flex items-center justify-between">
          {sendError ? <ErrorState message={sendError} /> : <span />}
          <Button type="submit" variant="primary" disabled={sending || !input.trim()}>
            {sending ? "Thinking…" : "Send"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
