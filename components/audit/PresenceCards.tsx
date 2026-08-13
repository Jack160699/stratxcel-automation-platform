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
    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      {links.map((link) => (
        <div key={link.key} className="flex items-start justify-between gap-2 rounded-sx-sm bg-sx-surface-2 px-2 py-2">
          <dt className="min-w-0">
            <span className="flex items-center gap-2">
              <PlatformIcon name={link.key} />
              <span className="font-medium">{link.label}</span>
            </span>
            {link.handle && <p className="mt-1 truncate pl-7 text-xs text-sx-text-muted">{link.handle}</p>}
            {link.href && link.public && (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex pl-7 text-xs font-medium text-sx-accent"
              >
                {link.openLabel ?? "Open"}
              </a>
            )}
          </dt>
          <dd className="shrink-0 text-xs text-sx-text-subtle">{statusLabel(link.status)}</dd>
        </div>
      ))}
    </dl>
  );
}
