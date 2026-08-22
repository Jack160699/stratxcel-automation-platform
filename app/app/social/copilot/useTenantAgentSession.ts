"use client";

// Tenant-scoped mirror of app/admin/(shell)/social/copilot/useAgentSession.ts
// — same live-progress polling / hydration / approve-reject flow, but every
// call is threaded through tenantId and hits the tenant-scoped server
// actions (tenant-actions.ts) and REST routes
// (/api/platform/social/copilot/runs...) instead of the owner-scoped ones.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  approveTenantAgentActionAction,
  rejectTenantAgentActionAction,
  getTenantAgentSessionAction,
  getTenantRunEventsAction,
  getTenantSessionAction,
  selectTenantCandidateAction,
} from "./tenant-actions";
import type { AgentMessageData } from "../../../admin/(shell)/social/agent/AgentMessage";
import type { AgentRunEventRow, AgentRunRow } from "@/lib/social/repositories/agent-runs";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";

const RUN_EVENT_POLL_MS = 1000;
const SESSION_HISTORY_TIMEOUT_MS = 12_000;

interface UseTenantAgentSessionResult {
  messages: AgentMessageData[];
  pending: boolean;
  loadingHistory: boolean;
  blockedReason: string | null;
  failedReason: string | null;
  run: AgentRunRow | null;
  runEvents: AgentRunEventRow[];
  session: AgentSessionRow | null;
  send: (text: string, attachmentIds?: string[]) => void;
  approve: (actionId: string) => void;
  reject: (actionId: string) => void;
  selectCandidate: (jobId: string, candidateId: string) => Promise<void>;
}

export function useTenantAgentSession(
  tenantId: string,
  sessionId: string | null,
  onSessionCreated: (id: string) => void
): UseTenantAgentSessionResult {
  const [messages, setMessages] = useState<AgentMessageData[]>([]);
  const [pending, setPending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [failedReason, setFailedReason] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRunRow | null>(null);
  const [runEvents, setRunEvents] = useState<AgentRunEventRow[]>([]);
  const [session, setSession] = useState<AgentSessionRow | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hydratedSessionRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollRunEvents = useCallback(
    (runId: string) => {
      stopPolling();
      const poll = () => {
        if (typeof document !== "undefined" && document.hidden) return;
        fetch(`/api/platform/social/copilot/runs/${encodeURIComponent(runId)}?tenantId=${encodeURIComponent(tenantId)}`, { cache: "no-store" })
          .then((response) => {
            if (!response.ok) throw new Error("Could not load run");
            return response.json() as Promise<{ run: AgentRunRow; events: AgentRunEventRow[] }>;
          })
          .then(({ run: latestRun, events }) => {
            setRun(latestRun);
            setRunEvents(events);
            if (latestRun && latestRun.status !== "RUNNING") stopPolling();
          })
          .catch(() => {});
      };
      poll();
      pollRef.current = setInterval(poll, RUN_EVENT_POLL_MS);
    },
    [stopPolling, tenantId]
  );

  useEffect(() => stopPolling, [stopPolling]);

  // Hydrate real persisted history when the active session changes — never fabricated.
  useEffect(() => {
    if (!sessionId || hydratedSessionRef.current === sessionId) return;
    hydratedSessionRef.current = sessionId;

    async function hydrate(sid: string) {
      setLoadingHistory(true);
      setFailedReason(null);
      setRun(null);
      setRunEvents([]);
      setSession(null);
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const history = Promise.all([
          getTenantAgentSessionAction(tenantId, sid),
          getTenantRunEventsAction(tenantId, sid),
          getTenantSessionAction(tenantId, sid),
        ]);
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("SESSION_HISTORY_TIMEOUT")), SESSION_HISTORY_TIMEOUT_MS);
        });
        const [{ messages: rows, actions }, { run: latestRun, events }, sessionRow] = await Promise.race([history, timeout]);
        const stillProposed = new Set(actions.filter((a) => a.status === "PROPOSED").map((a) => a.id));
        const mapped: AgentMessageData[] = rows.map((m) => ({
          id: m.id,
          role: m.role === "USER" ? "user" : m.role === "AGENT" ? "agent" : "system",
          content: m.content,
          parts: (m.parts as AgentMessageData["parts"]).map((p) =>
            p.type === "proposed_actions" ? { ...p, actions: p.actions?.filter((a) => stillProposed.has(a.id)) } : p
          ),
        }));
        const referenced = new Set(mapped.flatMap((message) => message.parts.flatMap((part) => part.actions?.map((action) => action.id) ?? [])));
        const unreferenced = actions.filter((action) => action.status === "PROPOSED" && !referenced.has(action.id));
        if (unreferenced.length) {
          mapped.push({
            id: `pending-actions-${sid}`,
            role: "system",
            content: "Dependent work is ready for review.",
            parts: [{ type: "proposed_actions", actions: unreferenced.map((action) => ({ id: action.id, tool: action.tool_name, input: action.input })) }],
          });
        }
        setMessages(mapped);
        setRun(latestRun);
        setRunEvents(events);
        setSession(sessionRow);
        if (latestRun?.status === "RUNNING") pollRunEvents(latestRun.id);
      } catch {
        hydratedSessionRef.current = null;
        setFailedReason("This session could not be loaded. Select it again to retry.");
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        setLoadingHistory(false);
      }
    }

    hydrate(sessionId);
  }, [sessionId, tenantId, pollRunEvents]);

  const send = useCallback(
    (text: string, attachmentIds?: string[]) => {
      const trimmed = text.trim();
      if ((!trimmed && (!attachmentIds || attachmentIds.length === 0)) || pending) return;
      setBlockedReason(null);
      setFailedReason(null);
      setMessages((prev) => [
        ...(sessionId ? prev : []),
        { id: `local-${Date.now()}`, role: "user", content: trimmed || "(Attached media)", parts: [] as AgentMessageData["parts"] },
      ]);
      if (!sessionId) {
        stopPolling();
        setRun(null);
        setRunEvents([]);
        setSession(null);
      }
      setPending(true);
      fetch("/api/platform/social/copilot/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          sessionId,
          message: trimmed || "Please review the attached media.",
          attachmentIds: attachmentIds || [],
        }),
      })
        .then(async (response) => {
          const accepted = await response.json();
          if (!response.ok) throw new Error(accepted.error ?? "Could not start the mission");
          return accepted as { sessionId: string; runId: string };
        })
        .then(async (accepted) => {
          if (accepted.sessionId !== sessionId) onSessionCreated(accepted.sessionId);
          hydratedSessionRef.current = accepted.sessionId;
          setSession({
            id: accepted.sessionId,
            owner_id: null,
            tenant_id: tenantId,
            title: (trimmed || "Media attachment").slice(0, 60),
            status: "GENERATING",
            context: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          pollRunEvents(accepted.runId);
          const response = await fetch(
            `/api/platform/social/copilot/runs/${encodeURIComponent(accepted.runId)}/execute?tenantId=${encodeURIComponent(tenantId)}`,
            { method: "POST" }
          );
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "The run could not execute");
          if ("blocked" in result && result.blocked) {
            setBlockedReason(result.message ?? "Agent is blocked.");
            setMessages((prev) => [...prev, { id: `agent-${Date.now()}`, role: "agent", content: result.message ?? "Blocked.", parts: [] }]);
            return;
          }
          if ("failed" in result && result.failed) {
            setFailedReason(result.reason ?? "The run failed unexpectedly.");
            setMessages((prev) => [
              ...prev,
              { id: `agent-${Date.now()}`, role: "agent", content: `I hit an error and couldn't finish: ${result.reason ?? "unknown error"}`, parts: [] },
            ]);
            return;
          }

          // Refresh full messages from database to include generated image candidates, receipts, etc.
          const detail = await getTenantAgentSessionAction(tenantId, accepted.sessionId).catch(() => null);
          if (detail) {
            const proposed = detail.actions.filter((a) => a.status === "PROPOSED");
            const proposedIds = new Set(proposed.map((action) => action.id));
            const mapped: AgentMessageData[] = detail.messages.map((m) => ({
              id: m.id,
              role: m.role === "USER" ? "user" : m.role === "AGENT" ? "agent" : "system",
              content: m.content,
              parts: (m.parts as AgentMessageData["parts"]).map((part) =>
                part.type === "proposed_actions"
                  ? { ...part, actions: part.actions?.filter((action) => proposedIds.has(action.id)) }
                  : part
              ),
            }));
            setMessages(mapped);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: `agent-${Date.now()}`,
                role: "agent",
                content: result.text || "Done.",
                parts: result.proposedActions?.length ? [{ type: "proposed_actions", actions: result.proposedActions }] : [],
              },
            ]);
          }
          getTenantSessionAction(tenantId, accepted.sessionId).then(setSession).catch(() => {});
        })
        .catch((error) => {
          setFailedReason(error instanceof Error ? error.message : "The run failed unexpectedly.");
        })
        .finally(() => {
          setPending(false);
        });
    },
    [pending, sessionId, tenantId, onSessionCreated, pollRunEvents, stopPolling]
  );

  const selectCandidate = useCallback(
    async (jobId: string, candidateId: string) => {
      if (!sessionId) return;
      try {
        const res = await selectTenantCandidateAction(tenantId, jobId, candidateId);
        if (!res?.ok) {
          setFailedReason(res?.error ?? "Could not select candidate.");
          return;
        }
        const detail = await getTenantAgentSessionAction(tenantId, sessionId).catch(() => null);
        if (detail) {
          const proposed = detail.actions.filter((a) => a.status === "PROPOSED");
          const proposedIds = new Set(proposed.map((action) => action.id));
          const mapped: AgentMessageData[] = detail.messages.map((m) => ({
            id: m.id,
            role: m.role === "USER" ? "user" : m.role === "AGENT" ? "agent" : "system",
            content: m.content,
            parts: (m.parts as AgentMessageData["parts"]).map((part) =>
              part.type === "proposed_actions"
                ? { ...part, actions: part.actions?.filter((action) => proposedIds.has(action.id)) }
                : part
            ),
          }));
          setMessages(mapped);
        }
      } catch (err: any) {
        setFailedReason(err?.message || "Could not select candidate.");
      }
    },
    [sessionId, tenantId]
  );

  const approve = useCallback(
    (actionId: string) => {
      approveTenantAgentActionAction(tenantId, actionId)
        .then((result) => {
          if (!result?.ok) {
            setFailedReason(result?.error ?? "Something went wrong while approving this review.");
            return;
          }
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.type === "proposed_actions" ? { ...p, actions: p.actions?.filter((a) => a.id !== actionId) } : p
              ),
            }))
          );
          if (sessionId) {
            hydratedSessionRef.current = null;
            return getTenantAgentSessionAction(tenantId, sessionId).then(({ messages: rows, actions }) => {
              const proposed = actions.filter((a) => a.status === "PROPOSED");
              const proposedIds = new Set(proposed.map((action) => action.id));
              const mapped: AgentMessageData[] = rows.map((m) => ({
                id: m.id,
                role: m.role === "USER" ? "user" : m.role === "AGENT" ? "agent" : "system",
                content: m.content,
                parts: (m.parts as AgentMessageData["parts"]).map((part) =>
                  part.type === "proposed_actions"
                    ? { ...part, actions: part.actions?.filter((action) => proposedIds.has(action.id)) }
                    : part
                ),
              }));
              const referenced = new Set(mapped.flatMap((message) => message.parts.flatMap((part) => part.actions?.map((action) => action.id) ?? [])));
              const unreferenced = proposed.filter((action) => !referenced.has(action.id));
              if (unreferenced.length) {
                mapped.push({
                  id: `approvals-${Date.now()}`,
                  role: "system",
                  content: "The upstream work completed. Review the dependent action below.",
                  parts: [{ type: "proposed_actions", actions: unreferenced.map((a) => ({ id: a.id, tool: a.tool_name, input: a.input })) }],
                });
              }
              setMessages(mapped);
            });
          }
        })
        .catch((error) =>
          setFailedReason(error instanceof Error ? error.message : "Something went wrong while approving this review.")
        );
    },
    [sessionId, tenantId]
  );

  const reject = useCallback(
    (actionId: string) => {
      rejectTenantAgentActionAction(tenantId, actionId)
        .then((result) => {
          if (!result?.ok) {
            setFailedReason(result?.error ?? "Something went wrong while cancelling this review.");
            return;
          }
          setMessages((prev) =>
            prev.map((m) => ({
              ...m,
              parts: m.parts.map((p) =>
                p.type === "proposed_actions" ? { ...p, actions: p.actions?.filter((a) => a.id !== actionId) } : p
              ),
            }))
          );
        })
        .catch(() => setFailedReason("Something went wrong while cancelling this review."));
    },
    [tenantId]
  );

  return {
    messages: sessionId ? messages : [],
    pending: sessionId ? pending : false,
    loadingHistory: sessionId ? loadingHistory : false,
    blockedReason: sessionId ? blockedReason : null,
    failedReason: sessionId ? failedReason : null,
    run: sessionId ? run : null,
    runEvents: sessionId ? runEvents : [],
    session: sessionId ? session : null,
    send,
    approve,
    reject,
    selectCandidate,
  };
}
