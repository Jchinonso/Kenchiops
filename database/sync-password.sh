#!/bin/bash
# Syncs the POSTGRES_PASSWORD env var to the actual PostgreSQL user password.
# This runs on every container start (not just first init) to prevent
# password desync when the env var changes but the data volume persists.

set -e

if [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_USER" ]; then
  echo "sync-password: POSTGRES_PASSWORD or POSTGRES_USER not set, skipping"
  exit 0
fi

# Use PGPASSWORD-less local connection (trust/peer auth on unix socket)
# Escape single quotes in password to prevent SQL injection
ESCAPED_PASSWORD="${POSTGRES_PASSWORD//\'/\'\'}"

psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" -c "ALTER USER \"$POSTGRES_USER\" PASSWORD '${ESCAPED_PASSWORD}';" 2>/dev/null

echo "sync-password: password synced for user $POSTGRES_USER"
