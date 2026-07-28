"use client";

import { useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { BrandForm } from "./BrandForm";
import { RemoveButton } from "./RemoveButton";
import { useEditGuard } from "./useEditGuard";
import type { BrandFormAction } from "../types";

export interface ProductItem {
  name: string;
  description?: string;
  audience?: string;
  cta?: string;
  url?: string;
}

export function ProductsSection({
  items,
  addAction,
  updateAction,
  removeAction,
}: {
  items: ProductItem[];
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
        <h2 className="saut-section-title">Products &amp; services</h2>
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
          className="grid gap-2 sm:grid-cols-2"
          onSuccess={() => setEditingIndex(null)}
          onCancel={() => setEditingIndex(null)}
        >
          <input type="hidden" name="index" value={editingIndex ?? ""} />
          <input name="name" defaultValue={editing.name} placeholder="Name" required className="saut-input" />
          <input name="cta" defaultValue={editing.cta ?? ""} placeholder="Call to action" className="saut-input" />
          <input name="audience" defaultValue={editing.audience ?? ""} placeholder="Audience" className="saut-input" />
          <input name="url" defaultValue={editing.url ?? ""} placeholder="URL" className="saut-input" />
          <textarea
            name="description"
            defaultValue={editing.description ?? ""}
            placeholder="Description"
            rows={2}
            className="saut-input h-auto py-2 sm:col-span-2"
          />
        </BrandForm>
      ) : (
        <BrandForm action={addAction} submitLabel="Add product" className="grid gap-2 sm:grid-cols-2" resetOnSuccess>
          <input name="name" placeholder="Name" required className="saut-input" />
          <input name="cta" placeholder="Call to action" className="saut-input" />
          <input name="audience" placeholder="Audience" className="saut-input" />
          <input name="url" placeholder="URL" className="saut-input" />
          <textarea name="description" placeholder="Description" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
        </BrandForm>
      )}

      <div className="space-y-2">
        {items.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
            <span className="min-w-0 truncate font-medium">{p.name}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button onClick={() => setEditingIndex(i)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
                Edit
              </button>
              <RemoveButton action={removeAction} hiddenFields={{ index: i }} itemLabel={p.name} />
            </div>
          </div>
        ))}
        {items.length === 0 && <EmptyState>No products yet.</EmptyState>}
      </div>
    </section>
  );
}
