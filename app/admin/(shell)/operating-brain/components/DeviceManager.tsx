"use client";

import { useState } from "react";
import { ActionButton } from "./ActionButtons";

interface DeviceRow {
  id: string;
  device_name: string;
  status: string;
  last_seen_at: string | null;
}

export function DeviceManager({
  devices,
  onCreate,
  onRevoke,
}: {
  devices: DeviceRow[];
  onCreate: (name: string) => Promise<{ deviceId: string; pairingCode: string }>;
  onRevoke: (deviceId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [justPaired, setJustPaired] = useState<{ deviceId: string; pairingCode: string } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {devices.map((d) => (
        <div key={d.id} className="flex items-center justify-between border-t border-sx-border pt-2 first:border-t-0 first:pt-0">
          <div>
            <div className="text-[12.5px] text-sx-text">{d.device_name}</div>
            <div className="font-sx-mono text-[10px] uppercase tracking-[0.06em] text-sx-text-subtle">
              {d.status} {d.last_seen_at ? `— last seen ${new Date(d.last_seen_at).toLocaleString()}` : ""}
            </div>
          </div>
          {d.status === "PAIRED" && <ActionButton label="Revoke" tone="danger" onClick={() => onRevoke(d.id)} />}
        </div>
      ))}

      {justPaired && (
        <div className="rounded-sx-sm border border-dashed border-sx-border-strong p-2.5 text-[11px] text-sx-text-muted">
          One-time pairing code (shown once — enter it in the desktop companion when it starts):
          <div className="mt-1 font-sx-mono text-[12px] text-sx-text">{justPaired.pairingCode}</div>
          <div className="mt-1 font-sx-mono text-[10px] text-sx-text-subtle">deviceId: {justPaired.deviceId}</div>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Device name (e.g. Shriyansh-Laptop)"
          className="rounded-sx-sm border border-sx-border bg-sx-surface-2 px-2 py-1 text-[11px] text-sx-text"
        />
        <ActionButton
          label="Pair new device"
          tone="accent"
          onClick={async () => {
            if (!name.trim()) return;
            const result = await onCreate(name.trim());
            setJustPaired(result);
            setName("");
          }}
        />
      </div>
    </div>
  );
}
