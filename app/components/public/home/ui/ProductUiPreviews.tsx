import React from "react";
import { CheckIcon } from "../../icons/FeatureIcons";

export function WebsiteUiPreview() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="ml-1.5 rounded bg-white px-2 py-0.5 font-mono text-[9.5px] text-slate-500 border border-slate-200/60">
            https://yourbusiness.com
          </span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          99/100 Speed
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="h-4 w-3/4 rounded bg-slate-200/80" />
        <div className="h-2.5 w-full rounded bg-slate-200/50" />
        <div className="flex gap-2 pt-1">
          <div className="h-6 w-20 rounded bg-blue-600/80" />
          <div className="h-6 w-16 rounded border border-slate-300 bg-white" />
        </div>
      </div>
    </div>
  );
}

export function SeoUiPreview() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <span className="font-mono text-[10px] font-semibold text-slate-600">Google Search Discovery</span>
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
          Top 3 Rank
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <p className="text-[11.5px] font-semibold text-blue-600">
          Best {`{Your Business Category}`} Near You
        </p>
        <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">
          Verified services, direct customer appointments, and updated operating hours.
        </p>
        <div className="flex items-center gap-2 pt-1 text-[9.5px] font-medium text-emerald-700">
          <span>▲ +14 high-intent keywords indexed</span>
        </div>
      </div>
    </div>
  );
}

export function ContentUiPreview() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <span className="font-mono text-[10px] font-semibold text-slate-600">Brand Voice Grounded</span>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
          <CheckIcon className="w-3 h-3 text-emerald-600" />
          Zero False Claims
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="rounded bg-white p-2 border border-slate-200/60 text-[10.5px] text-slate-700 leading-snug">
          &ldquo;Clear, customer-focused explanation of your services matching your brand rules.&rdquo;
        </div>
        <div className="flex items-center justify-between text-[9.5px] text-slate-500">
          <span>Tone: Friendly & Professional</span>
          <span>Target: Local Clients</span>
        </div>
      </div>
    </div>
  );
}

export function SocialUiPreview() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <span className="font-mono text-[10px] font-semibold text-slate-600">Weekly Schedule</span>
        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
          5 Posts Ready
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-5 gap-1 text-center">
        {["M", "T", "W", "T", "F"].map((day, i) => (
          <div
            key={day + i}
            className={`rounded p-1 text-[9px] font-medium ${
              i < 4
                ? "bg-blue-50 text-blue-700 border border-blue-100"
                : "bg-white text-slate-400 border border-slate-200/60"
            }`}
          >
            <div>{day}</div>
            <div className="mt-0.5 text-[8px]">{i < 4 ? "✓" : "—"}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9.5px] text-slate-500">
        Tailored for LinkedIn, Instagram & Facebook with 1-click review.
      </p>
    </div>
  );
}

export function CrmUiPreview() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <span className="font-mono text-[10px] font-semibold text-slate-600">Inbound Leads</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          Reply Drafted
        </span>
      </div>
      <div className="mt-2.5 rounded bg-white p-2 border border-slate-200/60 space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-semibold text-slate-800">New Inquiry · WhatsApp</span>
          <span className="text-slate-400">2m ago</span>
        </div>
        <p className="text-[10px] text-slate-600 italic">“Hi, do you have availability this Friday?”</p>
        <div className="pt-1 flex items-center justify-between text-[9px] text-blue-600 font-medium">
          <span>AI Draft prepared →</span>
          <span className="text-slate-500">Requires your approval</span>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsUiPreview() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 shadow-xs transition-all">
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
        <span className="font-mono text-[10px] font-semibold text-slate-600">Weekly Executive Digest</span>
        <span className="text-[10px] font-semibold text-emerald-600">+28% Growth</span>
      </div>
      <div className="mt-2.5 flex items-end gap-1 h-10 pt-1">
        <div className="w-1/6 bg-blue-200 rounded-t h-[40%]" />
        <div className="w-1/6 bg-blue-300 rounded-t h-[55%]" />
        <div className="w-1/6 bg-blue-400 rounded-t h-[65%]" />
        <div className="w-1/6 bg-blue-500 rounded-t h-[80%]" />
        <div className="w-1/6 bg-blue-600 rounded-t h-[95%]" />
        <div className="w-1/6 bg-emerald-500 rounded-t h-[100%]" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[9.5px] text-slate-500">
        <span>Search: 42%</span>
        <span>Social: 33%</span>
        <span>Direct: 25%</span>
      </div>
    </div>
  );
}
