"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getLatestSessionAction } from "../agent/actions";

export type PanelMode = "closed" | "minimized" | "docked";
type LastPresentation = "docked" | "fullpage";

export const COPILOT_FULL_PAGE_PATH = "/admin/social/copilot";

interface PersistedState {
  panelMode: PanelMode;
  sessionId: string | null;
  lastWorkspacePath: string;
  lastPresentation: LastPresentation;
}

const STORAGE_KEY = "saut:copilot:presentation";

const DEFAULT_STATE: PersistedState = {
  panelMode: "minimized",
  sessionId: null,
  lastWorkspacePath: "/admin/social",
  lastPresentation: "docked",
};

function readPersisted(): PersistedState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return {
      panelMode: parsed.panelMode === "docked" || parsed.panelMode === "closed" ? parsed.panelMode : "minimized",
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : null,
      lastWorkspacePath: typeof parsed.lastWorkspacePath === "string" ? parsed.lastWorkspacePath : DEFAULT_STATE.lastWorkspacePath,
      lastPresentation: parsed.lastPresentation === "fullpage" ? "fullpage" : "docked",
    };
  } catch {
    return DEFAULT_STATE;
  }
}

// Session status is polled at a modest, always-on cadence so the sidebar
// "Copilot" status indicator stays honest without a live subscription.
// This is deliberately slower than the in-run execution polling (which only
// runs while a turn is active) — see useAgentSession.ts.
const STATUS_POLL_ACTIVE_MS = 4000;
const STATUS_POLL_IDLE_MS = 20000;

interface CopilotContextValue {
  panelMode: PanelMode;
  isFullPage: boolean;
  sessionId: string | null;
  sessionStatus: string | null;
  setSessionId: (id: string | null) => void;
  openDocked: () => void;
  openFullPage: () => void;
  dockAndReturn: () => void;
  minimize: () => void;
  close: () => void;
  openMostRecent: () => void;
  refreshStatus: () => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isFullPage = pathname === COPILOT_FULL_PAGE_PATH;

  const [state, setState] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string | null>(null);

  useEffect(() => {
    setState(readPersisted());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Track the last non-Copilot workspace page so "Dock Copilot" from the
  // full page has somewhere real to return to.
  useEffect(() => {
    if (!hydrated || isFullPage) return;
    setState((s) => (s.lastWorkspacePath === pathname ? s : { ...s, lastWorkspacePath: pathname }));
  }, [pathname, isFullPage, hydrated]);

  const refreshStatus = useCallback(() => {
    getLatestSessionAction()
      .then((session) => setSessionStatus(session?.status ?? null))
      .catch(() => {});
  }, []);

  const pollDelay = sessionStatus === "GENERATING" ? STATUS_POLL_ACTIVE_MS : STATUS_POLL_IDLE_MS;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    refreshStatus();
    timerRef.current = setInterval(refreshStatus, pollDelay);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollDelay]);

  const setSessionId = useCallback((id: string | null) => {
    setState((s) => ({ ...s, sessionId: id }));
  }, []);

  const openDocked = useCallback(() => {
    setState((s) => ({ ...s, panelMode: "docked", lastPresentation: "docked" }));
  }, []);

  const openFullPage = useCallback(() => {
    setState((s) => ({ ...s, lastPresentation: "fullpage" }));
    router.push(COPILOT_FULL_PAGE_PATH);
  }, [router]);

  const dockAndReturn = useCallback(() => {
    setState((s) => ({ ...s, panelMode: "docked", lastPresentation: "docked" }));
    router.push(state.lastWorkspacePath);
  }, [router, state.lastWorkspacePath]);

  const minimize = useCallback(() => {
    setState((s) => ({ ...s, panelMode: "minimized" }));
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, panelMode: "closed" }));
  }, []);

  const openMostRecent = useCallback(() => {
    if (state.lastPresentation === "fullpage") {
      router.push(COPILOT_FULL_PAGE_PATH);
    } else {
      setState((s) => ({ ...s, panelMode: "docked" }));
    }
  }, [router, state.lastPresentation]);

  const value = useMemo<CopilotContextValue>(
    () => ({
      panelMode: state.panelMode,
      isFullPage,
      sessionId: state.sessionId,
      sessionStatus,
      setSessionId,
      openDocked,
      openFullPage,
      dockAndReturn,
      minimize,
      close,
      openMostRecent,
      refreshStatus,
    }),
    [state.panelMode, state.sessionId, isFullPage, sessionStatus, setSessionId, openDocked, openFullPage, dockAndReturn, minimize, close, openMostRecent, refreshStatus]
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error("useCopilot must be used within CopilotProvider");
  return ctx;
}

export function sessionStatusLabel(status: string | null): { label: string; tone: "idle" | "working" | "waiting" | "failed" } {
  switch (status) {
    case "GENERATING":
      return { label: "Working", tone: "working" };
    case "WAITING_FOR_CHOICE":
      return { label: "Waiting approval", tone: "waiting" };
    case "FAILED":
    case "ATTENTION_REQUIRED":
      return { label: "Failed", tone: "failed" };
    case "BLOCKED":
      return { label: "Blocked", tone: "failed" };
    case null:
      return { label: "Idle", tone: "idle" };
    default:
      return { label: "Idle", tone: "idle" };
  }
}
