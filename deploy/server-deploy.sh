#!/usr/bin/env bash
#
# Kenchi Server Deploy Script
#
# Runs ON the production VPS. Called by CI or manually.
# Implements: pre-flight → backup → pull → build → deploy → rollback on failure.
#
# Usage (on VPS):
#   cd /opt/kenchi && bash deploy/server-deploy.sh
#
# Environment:
#   DEPLOY_SHA (optional) — specific git SHA to deploy. Defaults to origin/main HEAD.
#

set -euo pipefail

APP_DIR="/opt/kenchi"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="/etc/kenchi/.env.production"
ROLLBACK_FILE="${APP_DIR}/.rollback-sha"
DEPLOY_HISTORY="${APP_DIR}/.deploy-history"

cd "$APP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err() { log "ERROR: $*" >&2; }

# ==================== 1. Pre-flight Checks ====================

log "=== Kenchi Deploy: Pre-flight ==="

if [ ! -f "$ENV_FILE" ]; then
  err "Production secrets not found at $ENV_FILE"
  err "Create it from deploy/.env.production.template"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not running"
  exit 1
fi

FREE_KB=$(df /opt --output=avail | tail -1 | tr -d ' ')
FREE_GB=$((FREE_KB / 1024 / 1024))
if [ "$FREE_GB" -lt 2 ]; then
  err "Low disk space: ${FREE_GB}GB free (need 2GB minimum)"
  err "Run: docker system prune -f"
  exit 1
fi

log "Pre-flight passed (disk: ${FREE_GB}GB free)"

# ==================== 2. Backup Current State ====================

log "=== Kenchi Deploy: Backup ==="

CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "$CURRENT_SHA" > "$ROLLBACK_FILE"
log "Current SHA: $CURRENT_SHA (saved to $ROLLBACK_FILE)"

# ==================== 3. Pull Latest Code ====================

log "=== Kenchi Deploy: Pull ==="

git fetch origin main

DEPLOY_SHA="${DEPLOY_SHA:-$(git rev-parse origin/main)}"
log "Deploying SHA: $DEPLOY_SHA"

git reset --hard "$DEPLOY_SHA"

export DEPLOY_HASH="$DEPLOY_SHA"

# ==================== 4. Build ====================

log "=== Kenchi Deploy: Build ==="

docker compose -f "$COMPOSE_FILE" build

# ==================== 5. Deploy & Wait for Healthy ====================

log "=== Kenchi Deploy: Deploy ==="

# --wait blocks until all containers with healthchecks report healthy (or timeout)
if docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout 180; then
  log "All containers healthy"
else
  err "Containers failed to become healthy"

  # Show what's unhealthy
  docker compose -f "$COMPOSE_FILE" ps
  docker compose -f "$COMPOSE_FILE" logs --tail=20 2>&1 | tail -40

  # ==================== Auto-Rollback ====================

  log "=== Auto-Rollback to $CURRENT_SHA ==="
  echo "$(date -Iseconds) | $DEPLOY_SHA | FAILED | rolling back to $CURRENT_SHA" >> "$DEPLOY_HISTORY"

  git reset --hard "$CURRENT_SHA"
  export DEPLOY_HASH="$CURRENT_SHA"

  docker compose -f "$COMPOSE_FILE" build
  docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout 180 || true

  if docker compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy\|Exit"; then
    err "CRITICAL: Rollback also failed. Manual intervention required."
    echo "$(date -Iseconds) | $CURRENT_SHA | ROLLBACK_FAILED | MANUAL INTERVENTION NEEDED" >> "$DEPLOY_HISTORY"
  else
    log "Rollback successful — running $CURRENT_SHA"
    echo "$(date -Iseconds) | $CURRENT_SHA | ROLLBACK_OK | restored" >> "$DEPLOY_HISTORY"
  fi

  exit 1
fi

# ==================== 6. Run Migrations ====================

log "=== Kenchi Deploy: Migrations ==="

for migration in database/init/*.sql; do
  BASENAME=$(basename "$migration")
  log "Applying: $BASENAME"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U kenchi -d kenchi -f "/docker-entrypoint-initdb.d/$BASENAME" 2>&1 | \
    grep -v "already exists" | grep -v "NOTICE" || true
done

# ==================== 7. Success ====================

log "=== Deploy SUCCESS ==="
docker compose -f "$COMPOSE_FILE" ps
echo "$(date -Iseconds) | $DEPLOY_SHA | SUCCESS | deployed by $(whoami)" >> "$DEPLOY_HISTORY"

docker image prune -f >/dev/null 2>&1 || true

log "Deploy complete: $DEPLOY_SHA"
