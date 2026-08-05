"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/Feedback";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface CreatedTenant {
  id: string;
  slug: string;
  name: string;
}

export function CreateClientForm({
  onCreated,
  compact = false,
}: {
  onCreated: (tenant: CreatedTenant) => void | Promise<void>;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // guards against double-click / repeated submission
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) {
      setError("Client name is required.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(trimmedSlug)) {
      setError("Slug must be lowercase letters, numbers, and hyphens only.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, slug: trimmedSlug }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) setError(`"${trimmedSlug}" is already in use — try a different slug.`);
        else if (res.status === 401) setError("Your session has expired. Sign in again and retry.");
        else if (res.status === 400) setError(body.error ?? "That client name or slug isn't valid.");
        else setError(body.error ?? "Something went wrong creating the client. Please try again.");
        return;
      }
      setName("");
      setSlug("");
      setSlugTouched(false);
      setDescription("");
      await onCreated(body.tenant as CreatedTenant);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`flex flex-col gap-3 ${compact ? "" : "max-w-md"}`}>
      <Field label="Client / business name">
        <Input value={name} onChange={(e) => handleNameChange(e.target.value)} required placeholder="Acme Retail" />
      </Field>
      <Field label="Slug">
        <Input
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          required
          pattern="[a-z0-9-]+"
          placeholder="acme-retail"
          className="font-sx-mono"
        />
        <span className="text-xs text-sx-text-subtle">Generated from the name — edit if you&apos;d like a different one.</span>
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this client does, key context…" />
        <span className="text-xs text-sx-text-subtle">
          Not saved yet — full client profiles land in a later phase. This stays local to the form for now.
        </span>
      </Field>

      {error && <ErrorState message={error} />}

      <Button type="submit" variant="primary" disabled={submitting} className="w-full">
        {submitting ? "Creating…" : "Create client"}
      </Button>
    </form>
  );
}
