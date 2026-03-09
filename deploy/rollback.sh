#!/usr/bin/env bash
#
# Kenchi Manual Rollback Script
#
# Rolls back to the previous deployment on the production VPS.
# Two modes:
#   1. Fast rollback (default) — restores previous git SHA and rebuilds
#   2. Specific SHA — pass as argument
#
# Usage (on VPS):
#   cd /opt/kenchi && bash deploy/rollback.sh           # Roll back to previous
#   cd /opt/kenchi && bash deploy/rollback.sh abc123    # Roll back to specific SHA
#

set -euo pipefail

APP_DIR="/opt/kenchi"
COMPOSE_FILE="docker-compose.prod.yml"
ROLLBACK_FILE="${APP_DIR}/.rollback-sha"
DEPLOY_HISTORY="${APP_DIR}/.deploy-history"

cd "$APP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err() { log "ERROR: $*" >&2; }

# Determine target SHA
if [ -n "${1:-}" ]; then
  TARGET_SHA="$1"
  log "Rolling back to specified SHA: $TARGET_SHA"
elif [ -f "$ROLLBACK_FILE" ]; then
  TARGET_SHA=$(cat "$ROLLBACK_FILE")
  log "Rolling back to previous SHA: $TARGET_SHA (from $ROLLBACK_FILE)"
else
  err "No rollback target. Pass a git SHA or ensure .rollback-sha exists."
  err "Recent deploys:"
  tail -5 "$DEPLOY_HISTORY" 2>/dev/null || echo "  (no deploy history)"
  exit 1
fi

CURRENT_SHA=$(git rev-parse HEAD)
if [ "$CURRENT_SHA" = "$TARGET_SHA" ]; then
  log "Already at $TARGET_SHA — nothing to roll back"
  exit 0
fi

log "Current: $CURRENT_SHA"
log "Target:  $TARGET_SHA"

# Restore code
git fetch origin
git reset --hard "$TARGET_SHA"

# Export DEPLOY_HASH so compose passes it to containers
export DEPLOY_HASH="$TARGET_SHA"

# Rebuild and restart all services
log "Rebuilding all services..."
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services
log "Waiting for services to stabilize..."
sleep 15

# Readiness check (matches server-deploy.sh)
if curl -sf http://localhost:3000/ready >/dev/null 2>&1; then
  log "Rollback successful — running $TARGET_SHA"
  docker compose -f "$COMPOSE_FILE" ps
  echo "$(date -Iseconds) | $TARGET_SHA | MANUAL_ROLLBACK | from $CURRENT_SHA" >> "$DEPLOY_HISTORY"
else
  err "Rollback health check failed. Check logs:"
  err "  docker compose -f $COMPOSE_FILE logs --tail=50"
  echo "$(date -Iseconds) | $TARGET_SHA | MANUAL_ROLLBACK_FAILED | from $CURRENT_SHA" >> "$DEPLOY_HISTORY"
  exit 1
fi
