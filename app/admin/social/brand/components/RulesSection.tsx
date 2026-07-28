"use client";

import { useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { SavedItemRow } from "../../components/SavedItemRow";
import { BrandForm } from "./BrandForm";
import { RemoveButton } from "./RemoveButton";
import { SectionEditingLabel } from "./SectionEditingLabel";
import { useEditGuard } from "./useEditGuard";
import type { BrandFormAction } from "../types";

export interface RuleItem {
  kind: string;
  text: string;
}

const RULE_KINDS = ["forbidden_claim", "disclaimer", "terminology", "competitor_policy", "cta_rule"];

export function RulesSection({
  items,
  addAction,
  updateAction,
  removeAction,
}: {
  items: RuleItem[];
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
        <h2 className="saut-section-title">Rules</h2>
        {editing && <SectionEditingLabel label={editing.text} />}
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
          <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)]">
            <select name="kind" defaultValue={editing.kind} className="saut-input">
              {RULE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <input name="text" defaultValue={editing.text} placeholder="Rule text" required className="saut-input" />
          </div>
        </BrandForm>
      ) : (
        <BrandForm action={addAction} submitLabel="Add" className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]" resetOnSuccess>
          <select name="kind" className="saut-input" defaultValue="forbidden_claim">
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input name="text" placeholder="Rule text" required className="saut-input" />
        </BrandForm>
      )}

      <div className="space-y-2">
        {items.map((r, i) => (
          <SavedItemRow
            key={i}
            actions={
              <>
                <button onClick={() => setEditingIndex(i)} className="saut-btn saut-btn-ghost !h-7 !px-2 text-xs">
                  Edit
                </button>
                <RemoveButton action={removeAction} hiddenFields={{ index: i }} itemLabel={r.text} />
              </>
            }
          >
            <span className="saut-item-row-label text-sm">
              <span className="saut-mono mr-2 text-[10px] uppercase" style={{ color: "var(--saut-text-subtle)" }}>
                {r.kind.replace(/_/g, " ")}
              </span>
              {r.text}
            </span>
          </SavedItemRow>
        ))}
        {items.length === 0 && <EmptyState>No rules yet.</EmptyState>}
      </div>
    </section>
  );
}
