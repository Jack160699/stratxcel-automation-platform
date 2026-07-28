"use client";

import { useActionState } from "react";
import {
  CONTENT_FORMATS,
  CONTENT_OBJECTIVES,
  CONTENT_PLATFORMS,
  YOUTUBE_PRIVACY_OPTIONS,
} from "@/lib/social/content-options";
import { createContentItemAction, type CreateContentFormState } from "../actions";

interface CreateContentFormProps {
  campaigns: Array<{ id: string; name: string }>;
  contentPillars: string[];
}

const INITIAL_CREATE_CONTENT_FORM_STATE: CreateContentFormState = {
  status: "idle",
  message: "",
};

export function CreateContentForm({ campaigns, contentPillars }: CreateContentFormProps) {
  const [state, formAction, pending] = useActionState(
    createContentItemAction,
    INITIAL_CREATE_CONTENT_FORM_STATE
  );

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Campaign
        <select name="campaign_id" className="saut-input mt-1 w-full">
          <option value="">No campaign</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Internal title
        <input name="title" required className="saut-input mt-1 w-full" />
      </label>

      <label className="space-y-1 text-xs sm:col-span-2" style={{ color: "var(--saut-text-muted)" }}>
        Master idea
        <textarea
          name="master_idea"
          required
          rows={2}
          className="saut-input mt-1 h-auto w-full py-2"
          placeholder="The cross-platform concept"
        />
      </label>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Objective
        <select name="objective" required className="saut-input mt-1 w-full" defaultValue="REACH">
          {CONTENT_OBJECTIVES.map((objective) => (
            <option key={objective.value} value={objective.value}>
              {objective.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Content pillar
        {contentPillars.length > 0 ? (
          <select name="content_pillar" required className="saut-input mt-1 w-full">
            {contentPillars.map((pillar) => (
              <option key={pillar} value={pillar}>
                {pillar}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="content_pillar"
            required
            className="saut-input mt-1 w-full"
            placeholder="Add a Brand Brain pillar"
          />
        )}
      </label>

      <div className="saut-section-title mt-2 sm:col-span-2">First platform variant</div>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Platform
        <select name="platform" required className="saut-input mt-1 w-full" defaultValue="instagram">
          {CONTENT_PLATFORMS.map((platform) => (
            <option key={platform.value} value={platform.value}>
              {platform.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Format
        <select name="format" required className="saut-input mt-1 w-full" defaultValue="post">
          {CONTENT_FORMATS.map((format) => (
            <option key={format.value} value={format.value}>
              {format.label}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs sm:col-span-2" style={{ color: "var(--saut-text-muted)" }}>
        YouTube visibility
        <select name="youtube_privacy_status" className="saut-input mt-1 w-full" defaultValue="private">
          {YOUTUBE_PRIVACY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="block text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
          Applied only to YouTube variants. New YouTube drafts default to private.
        </span>
      </label>

      <label className="space-y-1 text-xs sm:col-span-2" style={{ color: "var(--saut-text-muted)" }}>
        Caption
        <textarea name="caption" required rows={3} className="saut-input mt-1 h-auto w-full py-2" />
      </label>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Hashtags
        <input name="hashtags" className="saut-input mt-1 w-full" placeholder="Comma or space separated" />
      </label>

      <label className="space-y-1 text-xs" style={{ color: "var(--saut-text-muted)" }}>
        Media URLs
        <input name="media_urls" className="saut-input mt-1 w-full" placeholder="Optional, space separated" />
      </label>

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className="saut-card p-3 text-sm sm:col-span-2"
          style={{ color: state.status === "error" ? "var(--saut-danger)" : "var(--saut-success)" }}
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="saut-btn saut-btn-primary w-fit disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
      >
        {pending ? "Saving…" : "Save draft"}
      </button>
    </form>
  );
}
