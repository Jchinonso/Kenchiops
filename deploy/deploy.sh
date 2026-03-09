#!/usr/bin/env bash
#
# Kenchi Deploy Script (local trigger)
#
# Triggers a production deploy from your local machine by SSHing to
# the VPS and running server-deploy.sh. Does NOT use rsync.
#
# Usage:
#   ./deploy/deploy.sh              # Deploy latest main
#   ./deploy/deploy.sh abc123       # Deploy specific SHA
#   VPS_HOST=x.x.x.x ./deploy.sh   # Override VPS host
#

set -euo pipefail

VPS_HOST="${VPS_HOST:-72.62.235.90}"
VPS_USER="${VPS_USER:-root}"
APP_DIR="/opt/kenchi"

DEPLOY_SHA="${1:-}"

echo "=== Kenchi Production Deploy ==="
echo "Target: ${VPS_USER}@${VPS_HOST}:${APP_DIR}"
if [ -n "$DEPLOY_SHA" ]; then
  echo "SHA: $DEPLOY_SHA"
else
  echo "SHA: latest origin/main"
fi
echo ""

# Verify the VPS is reachable
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "echo ok" >/dev/null 2>&1; then
  echo "ERROR: Cannot reach ${VPS_HOST}"
  exit 1
fi

# Run server-deploy.sh on the VPS
SSH_CMD="cd $APP_DIR"
if [ -n "$DEPLOY_SHA" ]; then
  SSH_CMD="$SSH_CMD && DEPLOY_SHA=$DEPLOY_SHA bash deploy/server-deploy.sh"
else
  SSH_CMD="$SSH_CMD && bash deploy/server-deploy.sh"
fi

ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$SSH_CMD"

echo ""
echo "=== Deploy Complete ==="
echo "Site: https://kenchiops.app"
echo "Health: https://kenchiops.app/health"
