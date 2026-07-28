"use client";

import { BrandForm } from "./BrandForm";
import type { BrandFormAction } from "../types";

export interface CompanyProfileData {
  name?: string;
  industry?: string;
  business_model?: string;
  positioning?: string;
  description?: string;
  voice_tone: string;
  voice_avoid: string;
}

function fmt(iso: string) {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

export function CompanyProfileForm({ profile, updatedAt, action }: { profile: CompanyProfileData; updatedAt: string; action: BrandFormAction }) {
  return (
    <>
      <BrandForm action={action} submitLabel="Save" className="grid gap-2 sm:grid-cols-2">
        <input name="company_name" defaultValue={profile.name ?? ""} placeholder="Company name" className="saut-input" />
        <input name="industry" defaultValue={profile.industry ?? ""} placeholder="Industry" className="saut-input" />
        <input name="business_model" defaultValue={profile.business_model ?? ""} placeholder="Business model" className="saut-input sm:col-span-2" />
        <input name="positioning" defaultValue={profile.positioning ?? ""} placeholder="Positioning (one sentence)" className="saut-input sm:col-span-2" />
        <textarea name="description" defaultValue={profile.description ?? ""} placeholder="Description" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
        <input name="voice_tone" defaultValue={profile.voice_tone} placeholder="Tone words, comma separated (e.g. clear, premium, practical)" className="saut-input" />
        <input name="voice_avoid" defaultValue={profile.voice_avoid} placeholder="Blocked phrases, comma separated" className="saut-input" />
      </BrandForm>
      {updatedAt && (
        <p className="saut-mono text-[11px]" style={{ color: "var(--saut-text-subtle)" }}>
          Last saved {fmt(updatedAt)}
        </p>
      )}
    </>
  );
}
