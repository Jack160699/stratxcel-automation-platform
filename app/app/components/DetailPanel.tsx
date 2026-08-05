"use client";

import type { ReactNode } from "react";
import { Drawer, Modal } from "@/components/ui/Overlay";

interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Desktop right-side detail panel (≥768px) — list stays visible alongside it. Hidden below md so it never renders (and its fixed-position children never paint) on small screens. */
export function DetailDrawer({ open, onClose, title, children }: DetailPanelProps) {
  if (!open) return null;
  return (
    <div className="hidden md:block">
      <Drawer open={open} onClose={onClose} widthClassName="w-[420px]">
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-sx-sans text-base font-semibold text-sx-text">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="text-sx-text-subtle hover:text-sx-text">
              ✕
            </button>
          </div>
          {children}
        </div>
      </Drawer>
    </div>
  );
}

/** Mobile bottom sheet (<768px) counterpart — same open/close state as DetailDrawer, different chrome for a small viewport. */
export function MobileDetailSheet({ open, onClose, title, children }: DetailPanelProps) {
  return (
    <div className="md:hidden">
      <Modal open={open} onClose={onClose} title={title}>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">{children}</div>
      </Modal>
    </div>
  );
}

/** Convenience pairing — renders both, CSS/breakpoint picks one, matching DataTable's responsive-pair pattern. Most callers should just use this. */
export function DetailPanel({ open, onClose, title, children }: DetailPanelProps) {
  return (
    <>
      <DetailDrawer open={open} onClose={onClose} title={title}>
        {children}
      </DetailDrawer>
      <MobileDetailSheet open={open} onClose={onClose} title={title}>
        {children}
      </MobileDetailSheet>
    </>
  );
}
