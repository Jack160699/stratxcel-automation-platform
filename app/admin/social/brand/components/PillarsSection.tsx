"use client";

import { useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { BrandForm } from "./BrandForm";
import { RemoveButton } from "./RemoveButton";
import { useEditGuard } from "./useEditGuard";
import type { BrandFormAction } from "../types";

export interface PillarItem {
  name: string;
  description?: string;
}

export function PillarsSection({
  items,
  addAction,
  updateAction,
  removeAction,
}: {
  items: PillarItem[];
  addAction: BrandFormAction;
  updateAction: BrandFormAction;
  removeAction: BrandFormAction;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  useEditGuard(items.length, editingIndex, () => setEditingIndex(null));
  const editing = editingIndex !== null ? items[editingIndex] : null;

  return (
    <section className="saut-card space-y-3 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="saut-section-title">Content pillars</h2>
        {editing && (
          <span className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
            Editing <span style={{ color: "var(--saut-text)" }}>{editing.name}</span>
          </span>
        )}
      </div>

      {editing ? (
        <BrandForm
          key={editingIndex}
          action={updateAction}
          submitLabel="Save changes"
          className="space-y-2"
          onSuccess={() => setEditingIndex(null)}
          onCancel={() => setEditingIndex(null)}
        >
          <input type="hidden" name="index" value={editingIndex ?? ""} />
          <input name="name" defaultValue={editing.name} placeholder="Pillar name" required className="saut-input w-full" />
          <textarea name="description" defaultValue={editing.description ?? ""} placeholder="Description" rows={2} className="saut-input h-auto w-full py-2" />
        </BrandForm>
      ) : (
        <BrandForm action={addAction} submitLabel="Add" className="space-y-2" resetOnSuccess>
          <input name="name" placeholder="Pillar name" required className="saut-input w-full" />
          <textarea name="description" placeholder="Description" rows={2} className="saut-input h-auto w-full py-2" />
        </BrandForm>
      )}

      <div className="space-y-2">
        {items.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
            <span className="min-w-0 truncate">{p.name}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button onClick={() => setEditingIndex(i)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
                Edit
              </button>
              <RemoveButton action={removeAction} hiddenFields={{ index: i }} itemLabel={p.name} />
            </div>
          </div>
        ))}
        {items.length === 0 && <EmptyState>No pillars yet.</EmptyState>}
      </div>
    </section>
  );
}
