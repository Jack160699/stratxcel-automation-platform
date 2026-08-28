"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/Feedback";
import type { BrandBrainService } from "@stratxcel/brand-brain";

const SHORT_DESCRIPTION_MAX = 240;
const LONG_DESCRIPTION_MAX = 2000;
const NAME_MAX = 80;

function newService(order: number): BrandBrainService {
  return {
    id: crypto.randomUUID(),
    name: "",
    shortDescription: "",
    active: true,
    order,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Brand Brain Final UX + Data + Save System — structured Services
 * management (Sections 3-6). Compact cards + an inline expand-to-edit
 * form, never one giant textarea (Section 14). Deliberately generic: the
 * same component renders a restaurant's Kerala Seafood Thali, a plumber's
 * Emergency Plumbing, or StratXcel's own Social Autopilot — nothing here
 * assumes an industry.
 *
 * Edits are staged into the parent's `content` state via onChange, exactly
 * like every other field on this page (TagListCard, ListLinesCard, etc.) —
 * this component never talks to the network itself. The page's single
 * "Save Changes" button and save-state machine are the one real save
 * mechanism (Section 5: "Save changes; see saved state").
 */
export function ServicesEditor({
  services,
  onChange,
  readOnly,
}: {
  services: BrandBrainService[];
  onChange: (services: BrandBrainService[]) => void;
  readOnly: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const sorted = [...services].sort((a, b) => a.order - b.order);

  function addService() {
    const draft = newService(services.length);
    onChange([...services, draft]);
    setEditingId(draft.id);
  }

  function patchService(id: string, patch: Partial<BrandBrainService>) {
    onChange(services.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }

  function removeService(id: string) {
    onChange(services.filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function move(id: string, direction: -1 | 1) {
    const idx = sorted.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx]!;
    const b = sorted[swapIdx]!;
    onChange(services.map((s) => (s.id === a.id ? { ...s, order: b.order } : s.id === b.id ? { ...s, order: a.order } : s)));
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-sx-text-subtle">Services</p>
          <p className="mt-1 text-xs text-sx-text-muted">What you offer — used automatically by Social Autopilot, SEO, and your Website.</p>
        </div>
        {!readOnly && (
          <Button type="button" size="sm" variant="secondary" onClick={addService} className="shrink-0">
            + Add service
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No services added yet."
            subtitle={readOnly ? "No services have been added." : "Add your first service — a real name and a short description is all that's required."}
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {sorted.map((service, idx) =>
            editingId === service.id ? (
              <ServiceEditForm
                key={service.id}
                service={service}
                onSave={(patch) => {
                  patchService(service.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => {
                  if (!service.name.trim()) removeService(service.id);
                  setEditingId(null);
                }}
              />
            ) : (
              <ServiceCard
                key={service.id}
                service={service}
                isFirst={idx === 0}
                isLast={idx === sorted.length - 1}
                readOnly={readOnly}
                onEdit={() => setEditingId(service.id)}
                onDelete={() => removeService(service.id)}
                onToggleActive={() => patchService(service.id, { active: !service.active })}
                onMoveUp={() => move(service.id, -1)}
                onMoveDown={() => move(service.id, 1)}
              />
            )
          )}
        </div>
      )}
    </Card>
  );
}

function ServiceCard({
  service,
  isFirst,
  isLast,
  readOnly,
  onEdit,
  onDelete,
  onToggleActive,
  onMoveUp,
  onMoveDown,
}: {
  service: BrandBrainService;
  isFirst: boolean;
  isLast: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={`rounded-sx-sm border border-sx-border bg-sx-surface-2 p-3.5 ${!service.active ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-sx-text">{service.name || "Untitled service"}</p>
            {service.category && <span className="rounded-full bg-sx-surface-3 px-2 py-0.5 text-[10px] font-medium text-sx-text-muted">{service.category}</span>}
            {!service.active && <span className="rounded-full bg-sx-warning/15 px-2 py-0.5 text-[10px] font-semibold text-sx-warning">Inactive</span>}
          </div>
          {service.shortDescription && <p className="mt-1 text-xs text-sx-text-subtle">{service.shortDescription}</p>}
          {service.startingPrice && <p className="mt-1 text-[11px] font-medium text-sx-accent">From {service.startingPrice}</p>}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Move up" disabled={isFirst} onClick={onMoveUp} className="flex h-6 w-6 items-center justify-center rounded-sx-sm text-sx-text-subtle hover:bg-sx-surface-3 disabled:opacity-30">
                ↑
              </button>
              <button type="button" aria-label="Move down" disabled={isLast} onClick={onMoveDown} className="flex h-6 w-6 items-center justify-center rounded-sx-sm text-sx-text-subtle hover:bg-sx-surface-3 disabled:opacity-30">
                ↓
              </button>
            </div>
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-sx-border pt-2.5 text-[11.5px] font-semibold">
          <button type="button" onClick={onEdit} className="text-sx-accent hover:underline">
            Edit
          </button>
          <button type="button" onClick={onToggleActive} className="text-sx-text-muted hover:underline">
            {service.active ? "Archive" : "Reactivate"}
          </button>
          <button type="button" onClick={onDelete} className="text-sx-danger hover:underline">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ServiceEditForm({
  service,
  onSave,
  onCancel,
}: {
  service: BrandBrainService;
  onSave: (patch: Partial<BrandBrainService>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [shortDescription, setShortDescription] = useState(service.shortDescription);
  const [startingPrice, setStartingPrice] = useState(service.startingPrice ?? "");
  const [showMore, setShowMore] = useState(Boolean(service.category || service.longDescription || service.url || service.cta || service.facts?.length));
  const [category, setCategory] = useState(service.category ?? "");
  const [longDescription, setLongDescription] = useState(service.longDescription ?? "");
  const [url, setUrl] = useState(service.url ?? "");
  const [cta, setCta] = useState(service.cta ?? "");
  const [factsText, setFactsText] = useState((service.facts ?? []).join("\n"));

  const nameError = !name.trim() ? "Service name is required." : name.length > NAME_MAX ? `Keep it under ${NAME_MAX} characters.` : null;
  const canSave = !nameError;

  function commit() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      shortDescription: shortDescription.trim(),
      startingPrice: startingPrice.trim() || undefined,
      category: category.trim() || undefined,
      longDescription: longDescription.trim() || undefined,
      url: url.trim() || undefined,
      cta: cta.trim() || undefined,
      facts: factsText.split("\n").map((f) => f.trim()).filter(Boolean),
    });
  }

  return (
    <div className="rounded-sx-sm border-2 border-sx-accent bg-sx-surface-2 p-3.5">
      <div className="flex flex-col gap-3">
        <Field label="Service name">
          <Input value={name} maxLength={NAME_MAX} placeholder="e.g. Bridal Styling" onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        {nameError && <p className="-mt-2 text-[11px] text-sx-danger">{nameError}</p>}

        <Field label="What do you provide?">
          <Textarea
            value={shortDescription}
            maxLength={SHORT_DESCRIPTION_MAX}
            placeholder="A short, plain description any customer would understand."
            onChange={(e) => setShortDescription(e.target.value)}
          />
        </Field>
        <p className="-mt-2 text-right text-[10.5px] text-sx-text-subtle">{shortDescription.length}/{SHORT_DESCRIPTION_MAX}</p>

        <Field label="Starting price (optional)">
          <Input value={startingPrice} placeholder="e.g. ₹499 or Starting at $99/mo" onChange={(e) => setStartingPrice(e.target.value)} />
        </Field>

        {!showMore ? (
          <button type="button" onClick={() => setShowMore(true)} className="self-start text-[11.5px] font-semibold text-sx-accent hover:underline">
            + Optional details (category, link, longer description, facts)
          </button>
        ) : (
          <div className="flex flex-col gap-3 rounded-sx-sm bg-sx-surface-3/50 p-3">
            <Field label="Category (optional)">
              <Input value={category} placeholder="e.g. Hair, Emergency, Marketing" onChange={(e) => setCategory(e.target.value)} />
            </Field>
            <Field label="Longer description (optional)">
              <Textarea value={longDescription} maxLength={LONG_DESCRIPTION_MAX} placeholder="More detail for a website page or long-form content." onChange={(e) => setLongDescription(e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Link (optional)">
                <Input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
              </Field>
              <Field label="Call to action (optional)">
                <Input value={cta} placeholder="e.g. Book now" onChange={(e) => setCta(e.target.value)} />
              </Field>
            </div>
            <Field label="Verified facts (optional, one per line — only exact, true details)">
              <Textarea value={factsText} placeholder="e.g. Certified trainers only" onChange={(e) => setFactsText(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="primary" size="sm" onClick={commit} disabled={!canSave}>
            Done
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
