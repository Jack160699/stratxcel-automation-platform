import { useEffect, useRef } from "react";

/**
 * These entities have no per-item database id — they're addressed by
 * position within a JSON array on a single owner-scoped row (see
 * lib/social/repositories/brand.ts). That's fine for add/remove, but if the
 * array's length changes elsewhere (e.g. another row removed) while an item
 * is open for editing, the index the edit form is bound to may now point at
 * a different item. Closing edit mode on any length change is cheap
 * insurance against silently saving over the wrong record.
 */
export function useEditGuard(itemsLength: number, editingIndex: number | null, closeEdit: () => void) {
  const lengthRef = useRef(itemsLength);
  useEffect(() => {
    if (editingIndex !== null && itemsLength !== lengthRef.current) {
      closeEdit();
    }
    lengthRef.current = itemsLength;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsLength, editingIndex]);
}
