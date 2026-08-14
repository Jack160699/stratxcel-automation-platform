"use client";

import { useState } from "react";

interface SimulationStep {
  id: number;
  stage: string;
  agent: string;
  action: string;
  detail: string;
  status: "Completed" | "Pending Approval";
}

const SIMULATION_SCENARIOS = [
  {
    id: "retail",
    business: "Modern Apparel Co.",
    goal: "Acquire high-intent search customers & grow social",
    steps: [
      {
        id: 1,
        stage: "Signal Detection",
        agent: "SEO Agent",
        action: "High-intent search opportunity identified",
        detail: "Found 4 underserved keyword clusters with 3,400 monthly volume and weak competitor coverage.",
        status: "Completed" as const,
      },
      {
        id: 2,
        stage: "Competitor Analysis",
        agent: "Research Agent",
        action: "Price & feature gap mapped against top 3 competitors",
        detail: "Identified value proposition gap in sustainable fabric claims.",
        status: "Completed" as const,
      },
      {
        id: 3,
        stage: "Content Brief",
        agent: "Content Agent",
        action: "Brand Brain grounded article brief generated",
        detail: "Structured 1,200-word draft with zero unsubstantiated environmental claims.",
        status: "Completed" as const,
      },
      {
        id: 4,
        stage: "Social Adaptation",
        agent: "Social Agent",
        action: "Multi-channel carousel drafted for Instagram & LinkedIn",
        detail: "Adapted visual assets and captions tailored to native audience aesthetics.",
        status: "Completed" as const,
      },
      {
        id: 5,
        stage: "Human Checkpoint",
        agent: "Stratxcel Core",
        action: "Execution batch submitted for human sign-off",
        detail: "Requires business owner approval before publishing changes to live channels.",
        status: "Pending Approval" as const,
      },
    ],
  },
  {
    id: "b2b",
    business: "Apex Engineering Services",
    goal: "Capture & qualify inbound inquiries into CRM",
    steps: [
      {
        id: 1,
        stage: "Inbound Inquiry",
        agent: "WhatsApp & Web",
        action: "Commercial RFQ inquiry received",
        detail: "Inbound message parsed, phone normalized, and contact record created.",
        status: "Completed" as const,
      },
      {
        id: 2,
        stage: "Context Enrichment",
        agent: "Research Agent",
        action: "Company domain verified and industry sector mapped",
        detail: "Verified company domain and enriched company size & location context.",
        status: "Completed" as const,
      },
      {
        id: 3,
        stage: "Pipeline Routing",
        agent: "CRM Agent",
        action: "Lead assigned to sector specialist with SLA timer",
        detail: "Staged qualified lead in active sales pipeline with deal estimate.",
        status: "Completed" as const,
      },
      {
        id: 4,
        stage: "Draft Follow-up",
        agent: "Sales Agent",
        action: "Customized preliminary response proposal drafted",
        detail: "Drafted tailored response referencing client equipment specs.",
        status: "Completed" as const,
      },
      {
        id: 5,
        stage: "Human Checkpoint",
        agent: "Stratxcel Core",
        action: "Proposal waiting for sales engineer sign-off",
        detail: "Follow-up will only send after engineer confirms pricing terms.",
        status: "Pending Approval" as const,
      },
    ],
  },
];

export function LiveAgentSimulation() {
  const [activeScenario, setActiveScenario] = useState<number>(0);
  const scenario = SIMULATION_SCENARIOS[activeScenario];

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-500/25 bg-[#0a0e17] p-6 text-white shadow-2xl sm:p-8">
      {/* Simulation Badge Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
        <div className="flex items-center gap-2.5">
          <span className="rounded bg-sky-500/20 px-2 py-0.5 font-sx-mono text-[10px] font-bold uppercase tracking-wider text-sky-400">
            DEMO / SIMULATION
          </span>
          <span className="font-sx-mono text-[11px] text-white/50">
            Illustrative Workspace Data
          </span>
        </div>

        {/* Scenario Selector */}
        <div className="flex items-center gap-2">
          {SIMULATION_SCENARIOS.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveScenario(idx)}
              className={`rounded-lg px-3 py-1 font-sx-sans text-xs font-semibold transition-colors ${
                activeScenario === idx
                  ? "bg-sky-500 text-white"
                  : "bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white"
              }`}
            >
              {s.business}
            </button>
          ))}
        </div>
      </div>

      {/* Goal Context */}
      <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-sx-mono text-[10px] uppercase tracking-wider text-white/40">
              Target Goal
            </p>
            <p className="font-sx-sans text-sm font-semibold text-white">
              {scenario.goal}
            </p>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-sx-mono text-[10px] uppercase text-emerald-400">
            Continuous Loop Active
          </span>
        </div>
      </div>

      {/* Simulation Steps Sequence */}
      <div className="mt-6 space-y-3">
        {scenario.steps.map((step) => (
          <div
            key={step.id}
            className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-white/20 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-sx-mono text-xs font-bold text-sky-300">
                {step.id}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sx-sans text-xs font-bold text-white">
                    {step.action}
                  </span>
                  <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-sx-mono text-[9.5px] uppercase text-white/50">
                    {step.agent}
                  </span>
                </div>
                <p className="mt-1 font-sx-sans text-xs text-white/60">
                  {step.detail}
                </p>
              </div>
            </div>

            <div className="shrink-0 self-end sm:self-center">
              <span
                className={`rounded-full px-2.5 py-0.5 font-sx-mono text-[10px] font-semibold uppercase tracking-wider ${
                  step.status === "Completed"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                }`}
              >
                {step.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-center font-sx-sans text-xs text-white/40">
        Your Stratxcel AI Agent continuously turns business signals into structured, governed work.
      </p>
    </div>
  );
}
