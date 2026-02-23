#!/usr/bin/env bash
#
# Kenchi Deploy Script
#
# Deploys the Kenchi stack to the production VPS.
# Can be run manually or from GitHub Actions.
#
# Usage:
#   ./deploy/deploy.sh              # Deploy from local machine
#   VPS_HOST=x.x.x.x ./deploy.sh   # Override VPS host
#

set -euo pipefail

VPS_HOST="${VPS_HOST:-72.62.235.90}"
VPS_USER="${VPS_USER:-root}"
APP_DIR="/opt/kenchi"
COMPOSE_FILE="docker-compose.prod.yml"

echo "=== Kenchi Production Deploy ==="
echo "Target: ${VPS_USER}@${VPS_HOST}:${APP_DIR}"
echo ""

# ==================== Sync Code ====================

echo "[1/5] Syncing code to VPS..."
rsync -azP --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.production' \
  --exclude='postgres_data' \
  --exclude='redis_data' \
  --exclude='.claude' \
  --exclude='dist' \
  --exclude='coverage' \
  --exclude='.next' \
  -e "ssh -o StrictHostKeyChecking=no" \
  . "${VPS_USER}@${VPS_HOST}:${APP_DIR}/"

echo "  Code synced."

# ==================== Build & Deploy ====================

echo "[2/5] Building and deploying containers..."
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" << 'DEPLOY_EOF'
  set -euo pipefail
  cd /opt/kenchi

  # Build and start all services
  docker compose -f docker-compose.prod.yml up --build -d

  # Wait for services to be healthy
  echo "  Waiting for services to be healthy..."
  sleep 10
DEPLOY_EOF

echo "  Containers deployed."

# ==================== Run Migrations ====================

echo "[3/5] Running database migrations..."
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" << 'MIGRATE_EOF'
  set -euo pipefail
  cd /opt/kenchi

  # Run all migration files in order
  for migration in database/init/*.sql; do
    echo "  Applying: $(basename "$migration")"
    docker compose -f docker-compose.prod.yml exec -T postgres \
      psql -U kenchi -d kenchi -f "/docker-entrypoint-initdb.d/$(basename "$migration")" 2>&1 | \
      grep -v "already exists" | grep -v "NOTICE" || true
  done
MIGRATE_EOF

echo "  Migrations complete."

# ==================== Seed Reference Data ====================

echo "[4/5] Seeding reference data..."
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" << 'SEED_EOF'
  set -euo pipefail
  cd /opt/kenchi

  docker compose -f docker-compose.prod.yml exec -T postgres \
    psql -U kenchi -d kenchi < database/seed.sql
SEED_EOF

echo "  Seed data applied."

# ==================== Health Check ====================

echo "[5/5] Verifying deployment..."
ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" << 'HEALTH_EOF'
  set -euo pipefail

  # Check each service health
  for service in api slack-bot github-app incident-triage; do
    port=$(docker compose -f /opt/kenchi/docker-compose.prod.yml port "$service" 3000 2>/dev/null | cut -d: -f2 || echo "")
    echo "  ${service}: $(docker inspect --format='{{.State.Health.Status}}' "$(docker compose -f /opt/kenchi/docker-compose.prod.yml ps -q "$service" 2>/dev/null)" 2>/dev/null || echo 'checking...')"
  done

  # Show running containers
  docker compose -f /opt/kenchi/docker-compose.prod.yml ps
HEALTH_EOF

echo ""
echo "=== Deploy Complete ==="
echo "Site: https://kenchiops.app"
echo "Health: https://kenchiops.app/health"
