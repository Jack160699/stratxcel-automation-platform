# Deploying apps/whatsapp-worker (prepared, not yet executed)

This runbook exists because neither a Dockerfile nor a deployment runbook
existed in this repo before this task, and this session has no AWS
credentials, CLI, console, or SSH access — nothing here has been deployed,
built, or tested against a real host. It is written so whoever has AWS
access can execute it directly, on the **same EC2 instance** already
hosting the legacy bot (`bot.stratxcel.ai`, confirmed via read-only network
evidence: `ec2-13-232-91-96.ap-south-1.compute.amazonaws.com`, nginx
1.18.0/Ubuntu terminating TLS with a Let's Encrypt cert, forwarding to a
Node/Express process) — no new AWS account, region, or paid service is
required to run this.

## What must run continuously

Two separate long-running processes (see `Dockerfile`'s header comment for
why they're split):

| Process | File | Default port | Role |
|---|---|---|---|
| Webhook receiver | `src/server.ts` | 8081 (`$PORT`) | Verifies Meta's signature, acks fast, enqueues |
| Queue processor | `src/processor.ts` | 8084 (`$WHATSAPP_PROCESSOR_PORT`) | Claims queued jobs, runs conversation logic, sends replies |

Both expose `GET /health`. Both must stay up — if the processor dies,
messages queue up silently with no reply ever sent; if the receiver dies,
Meta gets no acknowledgment at all and will eventually disable the webhook.

## Option A — systemd (matches the legacy bot's own deployment pattern)

The legacy repo documents exactly this pattern for its own process
(`backend/deploy.sh`, `backend/ai-os.service`, `backend/nginx.conf`) — two
new unit files mirror it:

```ini
# /etc/systemd/system/stratxcel-whatsapp-webhook.service
[Unit]
Description=Stratxcel WhatsApp webhook receiver
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=stratxcel
WorkingDirectory=/opt/stratxcel-automation-platform
EnvironmentFile=/opt/stratxcel-automation-platform/.env.whatsapp-worker
ExecStart=/usr/bin/node --experimental-strip-types apps/whatsapp-worker/src/server.ts
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/stratxcel-whatsapp-processor.service
[Unit]
Description=Stratxcel WhatsApp queue processor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=stratxcel
WorkingDirectory=/opt/stratxcel-automation-platform
EnvironmentFile=/opt/stratxcel-automation-platform/.env.whatsapp-worker
ExecStart=/usr/bin/node --experimental-strip-types apps/whatsapp-worker/src/processor.ts
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now stratxcel-whatsapp-webhook stratxcel-whatsapp-processor
```

## Option B — Docker (this app's `Dockerfile`)

```bash
docker build -f apps/whatsapp-worker/Dockerfile -t stratxcel-whatsapp-worker .
docker run -d --name stratxcel-wa-webhook -p 8081:8081 --env-file .env.whatsapp-worker \
  -e WORKER_ROLE=server stratxcel-whatsapp-worker
docker run -d --name stratxcel-wa-processor -p 8084:8084 --env-file .env.whatsapp-worker \
  -e WORKER_ROLE=processor stratxcel-whatsapp-worker
```

## Required environment (names only — never commit real values)

```
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WHATSAPP_INTEGRATION_MODE=live
WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_APP_SECRET
WHATSAPP_VERIFY_TOKEN
# optional
WHATSAPP_GRAPH_API_VERSION
PORT
WHATSAPP_PROCESSOR_PORT
# WHATSAPP_AUTO_REPLY_ENABLED=true — NOT set above and not documented until now.
# Without it, maybeSendAutomaticReply() (processor.ts) never sends anything —
# including the "Hi! 👋 StratXcel Support here. How can we help?" greeting
# shortcut for a bare "Hello" — even though the rest of the pipeline (lead
# upsert, response generation) runs normally. This is very likely OFF in the
# current deployment; confirm and set deliberately, it is not something a
# code change can verify or flip from the repo.
WHATSAPP_PROCESSOR_POLL_INTERVAL_MS
```

These are the *real, verified* WABA's credentials — the same ones the
legacy bot already uses today. Do not create new ones; do not rotate
existing ones unless a real reason arises.

## Exposing a public HTTPS callback without touching the legacy bot yet

Do **not** edit the existing nginx server block for `bot.stratxcel.ai` —
that config is actively serving the legacy bot's live traffic. Instead,
during pre-flight/validation, expose the new webhook receiver on either:

- a **new subdomain** (e.g. `wa-new.stratxcel.ai` — owner's DNS choice)
  pointed at the same EC2 instance, with its own nginx server block and
  its own Let's Encrypt certificate (`certbot --nginx -d wa-new.stratxcel.ai`), or
- a **new path** on the existing host if the owner prefers not to touch
  DNS (e.g. `bot.stratxcel.ai/stratxcel-webhook` proxied to `127.0.0.1:8081`),
  added as a new `location` block — additive, does not modify the existing
  legacy bot `location` block.

Only after the new endpoint passes every pre-flight check in the task
brief (GET challenge, signature verification fail-closed, `/health`
healthy, processor heartbeat current, queue enqueue/claim proven, phone
binding resolves) should the *existing verified number's* Meta webhook
callback actually be changed to it — and that change happens in Meta's
dashboard/API, not in this file.

## Non-goals of this runbook

- Does not touch Meta App/WABA/webhook configuration.
- Does not touch the legacy bot's process, config, or nginx block.
- Does not touch DNS.
- Does not claim to have been executed — it hasn't, this task, for lack of
  AWS access in this environment.
