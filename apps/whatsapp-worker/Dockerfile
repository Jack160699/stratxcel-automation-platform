# Stratxcel WhatsApp worker — two roles, one image.
#
# Not built or tested in this environment (Docker is unavailable in this
# development sandbox — every `supabase db push` this session logged the
# same Docker-daemon error). This is prepared, untested code: verify it
# builds and runs correctly before relying on it in production.
#
# Two long-running processes ship from this repo, deliberately separate so
# a slow conversation step never delays Meta's webhook ack:
#   - src/server.ts     the webhook receiver (verify, ack, enqueue)
#   - src/processor.ts  the queue consumer (runs conversation logic, sends)
# Both must run continuously. Run this image twice — once per role, via
# the WORKER_ROLE env var or a CMD override — never as a single combined
# process (that would reintroduce exactly the "slow step blocks Meta's ack"
# problem the split architecture exists to avoid).
#
# Build from the MONOREPO ROOT (needs the workspace packages this app
# depends on): docker build -f apps/whatsapp-worker/Dockerfile -t stratxcel-whatsapp-worker .

FROM node:22-slim AS base
WORKDIR /app

# Workspace-aware install: copy every package.json first so Docker's layer
# cache only invalidates on dependency changes, not on every source edit.
COPY package.json package-lock.json ./
COPY apps/whatsapp-worker/package.json apps/whatsapp-worker/package.json
COPY packages/whatsapp/package.json packages/whatsapp/package.json
COPY packages/leads-and-crm/package.json packages/leads-and-crm/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/audit/package.json packages/audit/package.json
COPY packages/human-handoff/package.json packages/human-handoff/package.json
COPY packages/missions/package.json packages/missions/package.json
RUN npm install --workspaces --if-present --include-workspace-root

COPY apps/whatsapp-worker apps/whatsapp-worker
COPY packages/whatsapp packages/whatsapp
COPY packages/leads-and-crm packages/leads-and-crm
COPY packages/queue packages/queue
COPY packages/audit packages/audit
COPY packages/human-handoff packages/human-handoff
COPY packages/missions packages/missions

# Runs on Node's built-in TypeScript stripping (--experimental-strip-types)
# — the same convention this repo's own test/dev scripts already use, so
# no separate build step or bundler is introduced here.
RUN addgroup --system --gid 1001 stratxcel && adduser --system --uid 1001 --gid 1001 stratxcel
USER stratxcel

ENV NODE_ENV=production
ENV WORKER_ROLE=server

# server.ts listens on $PORT (default 8081); processor.ts's health server
# listens on $WHATSAPP_PROCESSOR_PORT (default 8084). Whichever role runs,
# only its own port matters — the entrypoint below picks the right file.
EXPOSE 8081 8084

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.WORKER_ROLE === 'processor' ? (process.env.WHATSAPP_PROCESSOR_PORT || 8084) : (process.env.PORT || 8081)) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["sh", "-c", "if [ \"$WORKER_ROLE\" = \"processor\" ]; then exec node --experimental-strip-types apps/whatsapp-worker/src/processor.ts; else exec node --experimental-strip-types apps/whatsapp-worker/src/server.ts; fi"]
