"use client";

import { useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { SavedItemRow } from "../../components/SavedItemRow";
import { BrandForm } from "./BrandForm";
import { RemoveButton } from "./RemoveButton";
import { SectionEditingLabel } from "./SectionEditingLabel";
import { useEditGuard } from "./useEditGuard";
import type { BrandFormAction } from "../types";

export interface AudienceItem {
  name: string;
  pain_points?: string;
}

export function AudiencesSection({
  items,
  addAction,
  updateAction,
  removeAction,
}: {
  items: AudienceItem[];
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
        <h2 className="saut-section-title">Audiences</h2>
        {editing && <SectionEditingLabel label={editing.name} />}
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
          <input name="name" defaultValue={editing.name} placeholder="Segment name" required className="saut-input w-full" />
          <textarea name="pain_points" defaultValue={editing.pain_points ?? ""} placeholder="Pain points" rows={2} className="saut-input h-auto w-full py-2" />
        </BrandForm>
      ) : (
        <BrandForm action={addAction} submitLabel="Add" className="space-y-2" resetOnSuccess>
          <input name="name" placeholder="Segment name" required className="saut-input w-full" />
          <textarea name="pain_points" placeholder="Pain points" rows={2} className="saut-input h-auto w-full py-2" />
        </BrandForm>
      )}

      <div className="space-y-2">
        {items.map((a, i) => (
          <SavedItemRow
            key={i}
            actions={
              <>
                <button onClick={() => setEditingIndex(i)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
                  Edit
                </button>
                <RemoveButton action={removeAction} hiddenFields={{ index: i }} itemLabel={a.name} />
              </>
            }
          >
            <span className="saut-item-row-label text-sm">{a.name}</span>
          </SavedItemRow>
        ))}
        {items.length === 0 && <EmptyState>No audiences yet.</EmptyState>}
      </div>
    </section>
  );
}
