#!/usr/bin/env bash
#
# Kenchi Staging Deploy Script
#
# Runs ON the VPS alongside the production stack. Isolated containers,
# volumes, and DB — safe to break. Auto-triggered by pushes to `develop`.
#
# Usage (on VPS):
#   cd /opt/kenchi-staging && bash deploy/staging-deploy.sh
#
# Environment:
#   DEPLOY_SHA (optional) — specific git SHA to deploy. Defaults to origin/develop HEAD.
#
# Intentional differences from server-deploy.sh (production):
# - No auto-rollback — if staging breaks, we want to see it, not hide it.
# - No migrations guard — staging DB can be wiped and recreated freely.
# - Shorter wait timeout, smaller resource limits.

set -euo pipefail

APP_DIR="/opt/kenchi-staging"
COMPOSE_FILE="docker-compose.staging.yml"
COMPOSE_PROJECT="kenchi-staging"
ENV_FILE_ENC="${APP_DIR}/deploy/secrets/staging.env.enc"
ENV_FILE="/etc/kenchi/.env.staging"
AGE_KEY_FILE="/etc/kenchi/age.key"
DEPLOY_HISTORY="${APP_DIR}/.deploy-history"

cd "$APP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err() { log "ERROR: $*" >&2; }

decrypt_secrets() {
  if [ ! -f "$ENV_FILE_ENC" ]; then
    err "Encrypted staging secrets not found at $ENV_FILE_ENC"
    return 1
  fi

  if [ ! -r "$AGE_KEY_FILE" ]; then
    err "Age key not readable at $AGE_KEY_FILE"
    return 1
  fi

  local tmp
  tmp=$(mktemp -p /etc/kenchi .env.staging.XXXXXX)
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN

  SOPS_AGE_KEY_FILE="$AGE_KEY_FILE" \
    sops --decrypt --input-type dotenv --output-type dotenv "$ENV_FILE_ENC" > "$tmp"

  chmod 640 "$tmp"
  chown root:kenchi-deploy "$tmp" 2>/dev/null || chgrp kenchi-deploy "$tmp"
  mv "$tmp" "$ENV_FILE"
  trap - RETURN

  log "Staging secrets decrypted to $ENV_FILE"
}

# ==================== Pre-flight ====================

log "=== Staging Deploy: Pre-flight ==="

if ! command -v sops >/dev/null; then
  err "sops is not installed"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not running"
  exit 1
fi

if ! docker network inspect kenchi_default >/dev/null 2>&1; then
  err "Production network 'kenchi_default' missing — start prod stack first"
  exit 1
fi

# ==================== Pull ====================

log "=== Staging Deploy: Pull ==="

git fetch origin develop

DEPLOY_SHA="${DEPLOY_SHA:-$(git rev-parse origin/develop)}"
log "Deploying SHA: $DEPLOY_SHA"

git reset --hard "$DEPLOY_SHA"
export DEPLOY_HASH="$DEPLOY_SHA"

# ==================== Decrypt Secrets ====================

log "=== Staging Deploy: Decrypt Secrets ==="
decrypt_secrets || exit 1

# ==================== Build + Deploy ====================

log "=== Staging Deploy: Build ==="
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" build

log "=== Staging Deploy: Up ==="
if docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --wait --wait-timeout 120; then
  log "Staging containers healthy"
  echo "$(date -Iseconds) | $DEPLOY_SHA | SUCCESS | staging deploy by $(whoami)" >> "$DEPLOY_HISTORY"
else
  err "Staging containers failed to become healthy"
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" logs --tail=30
  echo "$(date -Iseconds) | $DEPLOY_SHA | FAILED | staging deploy by $(whoami)" >> "$DEPLOY_HISTORY"
  exit 1
fi

# ==================== Migrations ====================

log "=== Staging Deploy: Migrations ==="

for migration in database/init/*.sql; do
  BASENAME=$(basename "$migration")
  log "Applying: $BASENAME"
  docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" exec -T postgres \
    psql -U kenchi -d kenchi -f "/docker-entrypoint-initdb.d/$BASENAME" 2>&1 | \
    grep -v "already exists" | grep -v "NOTICE" || true
done

# ==================== Reload Caddy ====================
# Staging uses the prod Caddy via the shared network. Reload so it picks up
# any Caddyfile changes that ship with this SHA.

if docker ps --format '{{.Names}}' | grep -q '^kenchi-caddy$'; then
  log "Reloading prod Caddy to pick up Caddyfile changes"
  docker exec kenchi-caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -3 || true
fi

log "=== Staging Deploy SUCCESS ==="
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps
docker image prune -f >/dev/null 2>&1 || true

log "Staging deploy complete: $DEPLOY_SHA"
