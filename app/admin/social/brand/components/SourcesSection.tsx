"use client";

import { useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { BrandForm } from "./BrandForm";
import { RemoveButton } from "./RemoveButton";
import { useEditGuard } from "./useEditGuard";
import type { BrandFormAction } from "../types";

export interface SourceItem {
  kind: string;
  title: string;
  content?: string;
  source_url?: string;
}

export function SourcesSection({
  items,
  addAction,
  updateAction,
  removeAction,
}: {
  items: SourceItem[];
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
        <h2 className="saut-section-title">Knowledge sources</h2>
        {editing && (
          <span className="text-xs" style={{ color: "var(--saut-text-subtle)" }}>
            Editing <span style={{ color: "var(--saut-text)" }}>{editing.title}</span>
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
          <select name="kind" defaultValue={editing.kind} className="saut-input">
            <option value="note">Note</option>
            <option value="url">URL</option>
            <option value="document">Document</option>
          </select>
          <input name="title" defaultValue={editing.title} placeholder="Title" required className="saut-input" />
          <input
            name="source_url"
            defaultValue={editing.source_url ?? ""}
            placeholder="Source URL (if applicable)"
            className="saut-input sm:col-span-2"
          />
          <textarea
            name="content"
            defaultValue={editing.content ?? ""}
            placeholder="Content / notes"
            rows={2}
            className="saut-input h-auto py-2 sm:col-span-2"
          />
        </BrandForm>
      ) : (
        <BrandForm action={addAction} submitLabel="Add source" className="grid gap-2 sm:grid-cols-2" resetOnSuccess>
          <select name="kind" className="saut-input" defaultValue="note">
            <option value="note">Note</option>
            <option value="url">URL</option>
            <option value="document">Document</option>
          </select>
          <input name="title" placeholder="Title" required className="saut-input" />
          <input name="source_url" placeholder="Source URL (if applicable)" className="saut-input sm:col-span-2" />
          <textarea name="content" placeholder="Content / notes" rows={2} className="saut-input h-auto py-2 sm:col-span-2" />
        </BrandForm>
      )}

      <div className="space-y-2">
        {items.map((k, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--saut-surface-2)" }}>
            <span className="min-w-0 truncate">
              <span className="saut-mono mr-2 text-[10px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>
                {k.kind}
              </span>
              {k.title}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button onClick={() => setEditingIndex(i)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
                Edit
              </button>
              <RemoveButton action={removeAction} hiddenFields={{ index: i }} itemLabel={k.title} />
            </div>
          </div>
        ))}
        {items.length === 0 && <EmptyState>No knowledge sources yet.</EmptyState>}
      </div>
    </section>
  );
}
