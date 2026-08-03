#!/usr/bin/env bash
# Polls Hermes' documented GET /health and /health/detailed endpoints with
# bearer auth. Suitable for a container HEALTHCHECK, a systemd
# ExecStartPost, or an external uptime monitor. See
# docs/hermes/DEPLOYMENT.md and docs/hermes/OBSERVABILITY.md.
#
# Required env: HERMES_URL (e.g. http://127.0.0.1:8642), API_SERVER_KEY
set -euo pipefail

: "${HERMES_URL:?HERMES_URL is required, e.g. http://127.0.0.1:8642}"
: "${API_SERVER_KEY:?API_SERVER_KEY is required}"

status=$(curl -sf -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${API_SERVER_KEY}" \
  "${HERMES_URL}/health") || {
  echo "hermes healthcheck: unreachable" >&2
  exit 1
}

if [ "$status" != "200" ]; then
  echo "hermes healthcheck: HTTP ${status}" >&2
  exit 1
fi

echo "hermes healthcheck: ok"
