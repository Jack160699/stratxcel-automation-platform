"use client";

import { PlatformIcon } from "@/components/audit/PlatformIcon";
import type { PresenceLink } from "@/lib/audit/v1/presence";

function statusLabel(status: PresenceLink["status"]): string {
  if (status === "verified") return "Verified";
  if (status === "connected") return "Connected";
  if (status === "delivery") return "Delivery destination";
  if (status === "not_available") return "Not available";
  return "Not connected";
}

export function PresenceCards({ links }: { links: PresenceLink[] }) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {links.map((link) => (
        <div key={link.key} className="flex flex-col justify-between gap-2 rounded-sx-sm bg-sx-surface-2 p-3 border border-sx-border/60">
          <div className="flex items-start justify-between gap-2">
            <dt className="min-w-0">
              <span className="flex items-center gap-2">
                <PlatformIcon name={link.key} />
                <span className="font-semibold text-sx-text text-sm">{link.label}</span>
              </span>
              {link.handle && <p className="mt-1.5 pl-6 text-xs text-sx-text-muted break-all font-mono">{link.handle}</p>}
            </dt>
            <dd className="shrink-0 text-[11px] font-medium text-sx-text-subtle">{statusLabel(link.status)}</dd>
          </div>
          {link.href && link.public && (
            <div className="pt-1 pl-6">
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-xs font-semibold text-sx-accent hover:underline"
              >
                {link.openLabel ?? "Open channel →"}
              </a>
            </div>
          )}
        </div>
      ))}
    </dl>
  );
}
