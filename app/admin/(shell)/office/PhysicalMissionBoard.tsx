"use client";

import type { OfficeMission } from "./office-types";
import { ListChecks, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface PhysicalMissionBoardProps {
  missions: OfficeMission[];
}

export function PhysicalMissionBoard({ missions }: PhysicalMissionBoardProps) {
  const activeMissions = missions.slice(0, 4);

  return (
    <div className="relative flex flex-col rounded-2xl border border-white/15 bg-slate-950/80 p-3.5 shadow-2xl backdrop-blur-xl w-72 lg:w-80">
      {/* Board Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-cyan-300 uppercase">
          <ListChecks className="h-3 w-3 text-cyan-400" />
          <span>ACTIVE MISSIONS BOARD</span>
        </div>
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-cyan-300">
          {activeMissions.length} LIVE
        </span>
      </div>

      {/* Board Items */}
      <div className="mt-2.5 space-y-2">
        {activeMissions.length > 0 ? (
          activeMissions.map((m) => {
            const isCompleted = m.state === "COMPLETED";
            const isBlocked = m.state === "BLOCKED";

            return (
              <div
                key={m.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-2 transition-all hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-white truncate max-w-[170px]" title={m.goal}>
                    {m.goal}
                  </span>
                  <span
                    className={`font-mono text-[9px] font-bold ${
                      isCompleted
                        ? "text-emerald-400"
                        : isBlocked
                        ? "text-amber-400"
                        : "text-cyan-300"
                    }`}
                  >
                    {m.progressPercent}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isCompleted
                        ? "bg-emerald-400"
                        : isBlocked
                        ? "bg-amber-400"
                        : "bg-gradient-to-r from-cyan-400 to-indigo-500"
                    }`}
                    style={{ width: `${m.progressPercent}%` }}
                  />
                </div>

                {/* Assigned Specialist & Step */}
                <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                  <span className="text-slate-300 font-medium">@{m.assignedWorkerName}</span>
                  <span className="truncate max-w-[100px]">{m.currentStep || m.state}</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-3 text-center text-[10px] text-slate-400">
            <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-emerald-400" />
            <span>All workforce missions delivered</span>
          </div>
        )}
      </div>
    </div>
  );
}
