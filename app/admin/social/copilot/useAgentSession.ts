"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sendAgentMessageAction,
  approveAgentActionAction,
  rejectAgentActionAction,
  getAgentSessionAction,
  getRunEventsAction,
  getSessionAction,
} from "../agent/actions";
import type { AgentMessageData } from "../agent/AgentMessage";
import type { AgentRunEventRow, AgentRunRow } from "@/lib/social/repositories/agent-runs";
import type { AgentSessionRow } from "@/lib/social/repositories/agent";

const RUN_EVENT_POLL_MS = 1500;

interface UseAgentSessionResult {
  messages: AgentMessageData[];
  pending: boolean;
  loadingHistory: boolean;
  blockedReason: string | null;
  failedReason: string | null;
  run: AgentRunRow | null;
  runEvents: AgentRunEventRow[];
  session: AgentSessionRow | null;
  send: (text: string) => void;
  approve: (actionId: string) => void;
  reject: (actionId: string) => void;
}

export function useAgentSession(sessionId: string | null, onSessionCreated: (id: string) => void): UseAgentSessionResult {
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

  const pollRunEvents = useCallback((sid: string) => {
    stopPolling();
    pollRef.current = setInterval(() => {
      getRunEventsAction(sid)
        .then(({ run: latestRun, events }) => {
          setRun(latestRun);
          setRunEvents(events);
          if (latestRun && latestRun.status !== "RUNNING") stopPolling();
        })
        .catch(() => {});
    }, RUN_EVENT_POLL_MS);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  // Hydrate real persisted history when the active session changes (e.g. on
  // page load, or when switching presentation modes) — never fabricated.
  useEffect(() => {
    if (!sessionId || hydratedSessionRef.current === sessionId) return;
    hydratedSessionRef.current = sessionId;

    async function hydrate(sid: string) {
      setLoadingHistory(true);
      setRun(null);
      setRunEvents([]);
      setSession(null);
      const [{ messages: rows, actions }, { run: latestRun, events }, sessionRow] = await Promise.all([
        getAgentSessionAction(sid),
        getRunEventsAction(sid),
        getSessionAction(sid),
      ]);
      const stillProposed = new Set(actions.filter((a) => a.status === "PROPOSED").map((a) => a.id));
      const mapped: AgentMessageData[] = rows.map((m) => ({
        id: m.id,
        role: m.role === "USER" ? "user" : m.role === "AGENT" ? "agent" : "system",
        content: m.content,
        parts: (m.parts as AgentMessageData["parts"]).map((p) =>
          p.type === "proposed_actions" ? { ...p, actions: p.actions?.filter((a) => stillProposed.has(a.id)) } : p
        ),
      }));
      setMessages(mapped);
      setRun(latestRun);
      setRunEvents(events);
      setSession(sessionRow);
      if (latestRun?.status === "RUNNING") pollRunEvents(sid);
      setLoadingHistory(false);
    }

    hydrate(sessionId);
  }, [sessionId, pollRunEvents]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      setBlockedReason(null);
      setFailedReason(null);
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content: trimmed, parts: [] }]);
      setPending(true);
      if (sessionId) pollRunEvents(sessionId);
      sendAgentMessageAction(sessionId, trimmed)
        .then((result) => {
          if (result.sessionId && result.sessionId !== sessionId) {
            hydratedSessionRef.current = result.sessionId;
            onSessionCreated(result.sessionId);
          }
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
          setMessages((prev) => [
            ...prev,
            {
              id: `agent-${Date.now()}`,
              role: "agent",
              content: result.text || "Done.",
              parts: result.proposedActions?.length ? [{ type: "proposed_actions", actions: result.proposedActions }] : [],
            },
          ]);
          if (result.sessionId) {
            getRunEventsAction(result.sessionId)
              .then(({ run: latestRun, events }) => {
                setRun(latestRun);
                setRunEvents(events);
              })
              .catch(() => {});
            getSessionAction(result.sessionId).then(setSession).catch(() => {});
          }
        })
        .finally(() => {
          setPending(false);
          stopPolling();
        });
    },
    [pending, sessionId, onSessionCreated, pollRunEvents, stopPolling]
  );

  const approve = useCallback((actionId: string) => {
    setMessages((prev) => prev.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "proposed_actions" ? { ...p, actions: p.actions?.filter((a) => a.id !== actionId) } : p)) })));
    approveAgentActionAction(actionId).catch(() => {});
  }, []);

  const reject = useCallback((actionId: string) => {
    setMessages((prev) => prev.map((m) => ({ ...m, parts: m.parts.map((p) => (p.type === "proposed_actions" ? { ...p, actions: p.actions?.filter((a) => a.id !== actionId) } : p)) })));
    rejectAgentActionAction(actionId).catch(() => {});
  }, []);

  return { messages, pending, loadingHistory, blockedReason, failedReason, run, runEvents, session, send, approve, reject };
}
