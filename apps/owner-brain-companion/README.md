# Owner Brain Companion (Windows)

A small, foreground, console-visible companion that sends **owner-approved**
signals to your Operating Brain: which app has focus (window title optional
and off by default), session durations, and manual "remember this" notes.

**No covert collection.** It only runs when you start it, in a visible
console window — closing that window stops everything. It never captures
keystrokes, passwords, screenshots, or message content.

## What it does NOT do

- No password/credential capture
- No keylogging
- No hidden screenshots
- No silent background service (you start it; you see it running)
- No message-content interception (window titles are off by default, and
  even when on, this only ever reads the OS-reported title of the
  currently focused window — never message bodies)

## Setup

```powershell
cd apps\owner-brain-companion
npm install
```

## 1. Pair this device

In Stratxcel Admin → **My Operating Brain** → Source Health & Privacy
Control Center → Desktop Companion devices → "Pair new device", enter a
name, and note the `deviceId` and one-time pairing code shown (shown once).

```powershell
npm run pair
```

Paste the `deviceId` and pairing code when prompted. This stores a bearer
token locally at `%APPDATA%\stratxcel-owner-brain-companion\config.json` —
that file is local-only and never committed to any repository.

## 2. Start tracking

```powershell
npm start
```

Leave this console window open. It prints what it's currently tracking
and how many signals are queued for sync. Press `Ctrl+C` to stop —
tracking stops immediately and the queue is flushed one last time.

## 3. Configure consent (optional)

Edit `%APPDATA%\stratxcel-owner-brain-companion\config.json`:

```json
{
  "consent": {
    "collectActiveApp": true,
    "collectWindowTitle": false
  }
}
```

Set `collectActiveApp: false` to stop all app-tracking (manual `remember`
notes still work). Set `collectWindowTitle: true` only if you want window
titles included — off by default because titles can contain document
names, URLs, or other detail beyond "which app."

## Other commands

```powershell
npm run pause      # pause collection without unpairing
npm run resume      # resume
npm run status       # show pairing/consent/queue state
npm run remember -- "call the accountant tomorrow"   # save a note immediately
npm run unpair      # clear local pairing (also revoke the device from the admin UI — this alone does not invalidate the server-side token)
```

## Running automatically at Windows login (manual, optional)

This is the one genuinely manual step — Windows Task Scheduler / Startup
folder registration requires clicking through the Windows UI on your own
machine and isn't something that can be scripted from here safely:

1. Press `Win+R`, type `shell:startup`, press Enter.
2. Create a shortcut in that folder pointing to:
   `powershell.exe -NoExit -Command "cd 'C:\path\to\stratxcel-site\apps\owner-brain-companion'; npm start"`
3. Log out and back in to verify it starts automatically. You will still
   see the console window every time — that's intentional (the visible
   collection indicator).

## Revoking a device

Preferred: Admin UI → Privacy Control Center → Desktop Companion devices →
**Revoke** next to the device. This invalidates the server-side token
immediately regardless of what's on the device itself. `npm run unpair`
on the device only clears the local copy — do both for a full disconnect.
