"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface CopilotContextValue {
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
}

const CopilotContext = createContext<CopilotContextValue | null>(null);

/** Session selection for the Social capability canvas hosted by canonical Admin Copilot. */
export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(() => searchParams.get("session"));

  const value = useMemo(() => ({ sessionId, setSessionId }), [sessionId]);
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot(): CopilotContextValue {
  const context = useContext(CopilotContext);
  if (!context) throw new Error("useCopilot must be used within CopilotProvider");
  return context;
}
