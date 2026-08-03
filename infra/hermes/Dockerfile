# Hermes Agent has no official Docker image (confirmed against
# hermes-agent.nousresearch.com/docs/getting-started/installation, reviewed
# 2026-08-04 — installation is a shell installer, not a container pull).
# This builds one from that documented installer rather than guessing at a
# nonexistent published image name. NOT built or run by this branch.
#
# Verify the installer URL and any version pin against current docs before
# building for real — this file is unbuilt/unverified, per
# docs/hermes/MANUAL_REQUIREMENTS.md.

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    xz-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Runs as a dedicated, non-root user — production guidance in
# docs/hermes/SECRETS_AND_SECURITY.md says "run as non-root".
RUN useradd --create-home --shell /bin/bash hermes
USER hermes
WORKDIR /home/hermes

# Official installer manages its own Python 3.11 (via uv) and Node.js v22 —
# see docs/hermes/README.md sources table for where this was confirmed.
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

ENV PATH="/home/hermes/.local/bin:${PATH}"

# Secrets are never baked into the image — .env is mounted at runtime.
# See docker-compose.example.yml.
EXPOSE 8642

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["/bin/sh", "-c", "curl -sf -H \"Authorization: Bearer ${API_SERVER_KEY}\" http://127.0.0.1:8642/health || exit 1"]

# Terminal backend for tool-call sandboxing is configured to `docker` in
# config.yaml (see DEPLOYMENT.md) — that's a *further* container Hermes
# spawns per mission, distinct from this image, which is the gateway host
# process itself.
ENTRYPOINT ["hermes", "gateway"]
CMD ["--profile", "default", "--port", "8642"]
