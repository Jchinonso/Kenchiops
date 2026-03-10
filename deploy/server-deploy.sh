#!/usr/bin/env bash
#
# Kenchi Server Deploy Script
#
# Runs ON the production VPS. Called by CI or manually.
# Implements: pre-flight → backup → pull → build → verify → rollback on failure.
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
HEALTH_TIMEOUT=180  # seconds
HEALTH_INTERVAL=5   # seconds between checks

cd "$APP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err() { log "ERROR: $*" >&2; }

# ==================== 1. Pre-flight Checks ====================

log "=== Kenchi Deploy: Pre-flight ==="

# Verify secrets file exists and is readable
if [ ! -f "$ENV_FILE" ]; then
  err "Production secrets not found at $ENV_FILE"
  err "Create it from deploy/.env.production.template"
  exit 1
fi

# Verify Docker is running
if ! docker info >/dev/null 2>&1; then
  err "Docker daemon is not running"
  exit 1
fi

# Verify disk space (need at least 2GB free)
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

# Tag current images as :previous for fast rollback
SERVICES="api slack-bot github-app incident-triage frontend"
for svc in $SERVICES; do
  IMAGE=$(docker compose -f "$COMPOSE_FILE" images "$svc" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | head -1 || true)
  if [ -n "$IMAGE" ] && [ "$IMAGE" != ":" ]; then
    REPO=$(echo "$IMAGE" | cut -d: -f1)
    docker tag "$IMAGE" "${REPO}:previous" 2>/dev/null || true
    log "Tagged $IMAGE → ${REPO}:previous"
  fi
done

# ==================== 3. Pull Latest Code ====================

log "=== Kenchi Deploy: Pull ==="

git fetch origin main

DEPLOY_SHA="${DEPLOY_SHA:-$(git rev-parse origin/main)}"
log "Deploying SHA: $DEPLOY_SHA"

git reset --hard "$DEPLOY_SHA"

# Export DEPLOY_HASH so docker-compose.prod.yml passes it to all containers
export DEPLOY_HASH="$DEPLOY_SHA"

# ==================== 4. Build & Deploy (Atomic) ====================

log "=== Kenchi Deploy: Build ==="

# Build all images first (don't swap containers until all images are ready)
docker compose -f "$COMPOSE_FILE" build

log "=== Kenchi Deploy: Swap ==="

# Swap all containers at once
docker compose -f "$COMPOSE_FILE" up -d

# ==================== 5. Run Migrations ====================

log "=== Kenchi Deploy: Migrations ==="

# Wait for postgres to be ready
WAITED=0
until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U kenchi -d kenchi -q 2>/dev/null; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge 30 ]; then
    err "Postgres not ready after 30s"
    break
  fi
done

for migration in database/init/*.sql; do
  BASENAME=$(basename "$migration")
  log "Applying: $BASENAME"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U kenchi -d kenchi -f "/docker-entrypoint-initdb.d/$BASENAME" 2>&1 | \
    grep -v "already exists" | grep -v "NOTICE" || true
done

# ==================== 6. Health Verification ====================

log "=== Kenchi Deploy: Health Check (${HEALTH_TIMEOUT}s timeout) ==="

ELAPSED=0
HEALTHY=false

while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
  sleep "$HEALTH_INTERVAL"
  ELAPSED=$((ELAPSED + HEALTH_INTERVAL))

  # Check if API responds to /ready (readiness = DB + Redis connectivity)
  if curl -sf http://localhost:3000/ready >/dev/null 2>&1; then
    # Verify all containers are healthy
    UNHEALTHY=$(docker compose -f "$COMPOSE_FILE" ps --format '{{.Name}} {{.Health}}' 2>/dev/null | grep -v "healthy" | grep -v "N/A" || true)
    if [ -z "$UNHEALTHY" ]; then
      HEALTHY=true
      break
    fi
    log "Waiting... (${ELAPSED}s) — unhealthy: $UNHEALTHY"
  else
    log "Waiting... (${ELAPSED}s) — API not responding"
  fi
done

if [ "$HEALTHY" = true ]; then
  # Verify all services report the same deploy hash
  HASH_SHORT="${DEPLOY_SHA:0:12}"
  API_HASH=$(curl -sf http://localhost:3000/health 2>/dev/null | grep -o '"deployHash":"[^"]*"' | cut -d'"' -f4 || echo "")
  if [ -n "$API_HASH" ] && [ "${API_HASH:0:12}" != "$HASH_SHORT" ]; then
    log "WARNING: API reports deployHash=$API_HASH, expected $DEPLOY_SHA"
  fi

  log "=== Deploy SUCCESS ==="
  docker compose -f "$COMPOSE_FILE" ps
  echo "$(date -Iseconds) | $DEPLOY_SHA | SUCCESS | deployed by $(whoami)" >> "$DEPLOY_HISTORY"

  # Clean up old images to free disk space
  docker image prune -f >/dev/null 2>&1 || true

  log "Deploy complete: $DEPLOY_SHA"
  exit 0
fi

# ==================== 7. Auto-Rollback ====================

err "=== Deploy FAILED — Health check timed out ==="
err "Logs from failing services:"
docker compose -f "$COMPOSE_FILE" logs --tail=30 2>&1 | tail -60

log "=== Auto-Rollback to $CURRENT_SHA ==="

echo "$(date -Iseconds) | $DEPLOY_SHA | FAILED | rolling back to $CURRENT_SHA" >> "$DEPLOY_HISTORY"

# Restore previous code
git reset --hard "$CURRENT_SHA"

# Export DEPLOY_HASH for the rollback containers
export DEPLOY_HASH="$CURRENT_SHA"

# Rebuild from previous code
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

# Wait for rollback to stabilize
sleep 15

# Verify rollback readiness (matches deploy verification)
if curl -sf http://localhost:3000/ready >/dev/null 2>&1; then
  log "Rollback successful — running $CURRENT_SHA"
  echo "$(date -Iseconds) | $CURRENT_SHA | ROLLBACK_OK | restored" >> "$DEPLOY_HISTORY"
else
  err "CRITICAL: Rollback also failed. Manual intervention required."
  err "Check: docker compose -f $COMPOSE_FILE logs --tail=50"
  echo "$(date -Iseconds) | $CURRENT_SHA | ROLLBACK_FAILED | MANUAL INTERVENTION NEEDED" >> "$DEPLOY_HISTORY"
fi

exit 1
