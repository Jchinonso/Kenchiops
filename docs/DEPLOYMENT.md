# Kenchi Deployment Guide

## Overview

This document covers Kenchi's production deployment architecture, incident prevention measures, and operational runbooks. It addresses every class of production incident we've encountered and provides guardrails to prevent recurrence.

**Production Environment:**

- Single VPS at `72.62.235.90`
- Domain: `kenchiops.app` (HTTPS via Caddy)
- 8 containers: postgres, redis, api, github-app, slack-bot, incident-triage, frontend, caddy
- Docker Compose orchestration (`docker-compose.prod.yml`)

---

## Architecture

```
                    Internet
                       |
                   +---v---+
                   | Caddy  |  HTTPS termination, reverse proxy
                   +---+---+
            +----------+----------+
            v          v          v
        frontend      api     github-app <-- GitHub/GitLab webhooks
        (nginx)        |      slack-bot
                       |      incident-triage
                       |
                +------+------+
                v             v
            postgres        redis
            (pgvector)    (7-alpine)
```

---

## Secrets Management

### Rules

1. **Production secrets live at `/etc/kenchi/.env.production`** -- never inside the repo directory
2. The file is owned by `root:root` with mode `0600`
3. `docker-compose.prod.yml` references this path via `env_file`
4. Code operations (git pull, rsync, rm) cannot touch secrets
5. Never commit `.env` files -- `.gitignore` and `.dockerignore` both exclude them

### Why This Matters

On 2026-03-09, a manual `rsync` from a dev machine overwrote the production `.env`, causing:

- `POSTGRES_PASSWORD` mismatch (all DB queries failed)
- `INTERNAL_SERVICE_SECRET` desync between services (internal auth failures)
- Hours of downtime across all services

### Editing Secrets

```bash
ssh root@72.62.235.90
# Remove immutable flag
chattr -i /etc/kenchi/.env.production
# Edit
nano /etc/kenchi/.env.production
# Restore immutable flag
chattr +i /etc/kenchi/.env.production
# Restart all services to pick up changes
cd /opt/kenchi && docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Required Environment Variables

| Variable                     | Description                          | Used By                                               |
| ---------------------------- | ------------------------------------ | ----------------------------------------------------- |
| `POSTGRES_PASSWORD`          | Database password                    | postgres, api, github-app, slack-bot, incident-triage |
| `INTERNAL_SERVICE_SECRET`    | HMAC signing for inter-service calls | api, github-app                                       |
| `JWT_SECRET`                 | JWT signing for user auth            | api                                                   |
| `ENCRYPTION_KEY`             | AES-256-GCM for OAuth tokens at rest | api                                                   |
| `GITHUB_APP_PRIVATE_KEY`     | GitHub App authentication            | github-app                                            |
| `GITHUB_WEBHOOK_SECRET`      | Webhook signature verification       | github-app                                            |
| `GITHUB_OAUTH_CLIENT_ID`     | GitHub OAuth login                   | api                                                   |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth login                   | api                                                   |
| `GITLAB_OAUTH_CLIENT_ID`     | GitLab OAuth login                   | api                                                   |
| `GITLAB_OAUTH_CLIENT_SECRET` | GitLab OAuth login                   | api                                                   |
| `SLACK_BOT_TOKEN`            | Slack integration                    | slack-bot                                             |
| `SLACK_SIGNING_SECRET`       | Slack webhook verification           | slack-bot                                             |
| `LLM_API_KEY`                | LLM provider API key                 | api                                                   |

---

## Deployment Process

### Automated (Preferred)

Deployments are triggered automatically when code merges to `main`:

1. CI workflow runs (lint, type-check, test, build, Docker build)
2. On CI success, deploy workflow triggers
3. Deploy workflow SSHs to VPS and runs `deploy/server-deploy.sh`
4. Script pulls latest code, builds all images, restarts all services atomically
5. Post-deploy health check verifies all services are healthy
6. On failure, automatic rollback to previous version

### Manual (Emergency Only)

```bash
ssh root@72.62.235.90
cd /opt/kenchi
git fetch origin main
git reset --hard origin/main
docker compose -f docker-compose.prod.yml up --build -d
# Verify all services are healthy
docker compose -f docker-compose.prod.yml ps
```

### Critical Rules

1. **Always rebuild ALL services together** -- never `docker compose up --build -d api` alone. Partial rebuilds cause secret and version mismatches between containers.
2. **Never rsync to production** -- use `git pull` only. rsync can overwrite secrets, configs, and Docker volumes.
3. **Never edit code on the production server** -- all changes go through git.

---

## Deploy Script (`deploy/server-deploy.sh`)

The production deploy script implements this lifecycle:

```
1. Pre-flight checks
   +-- Verify /etc/kenchi/.env.production exists
   +-- Verify Docker daemon is running
   +-- Verify disk space > 2GB free

2. Backup current state
   +-- Record current git SHA to .rollback-sha
   +-- Tag current Docker images as :previous

3. Pull latest code
   +-- git fetch origin main
   +-- git reset --hard origin/main

4. Build and deploy (atomic)
   +-- docker compose build          (build all images first)
   +-- docker compose up -d          (swap all containers at once)

5. Health verification (120s timeout)
   +-- Wait for all services to report healthy
   +-- Verify all services share same DEPLOY_HASH
   +-- On failure -> automatic rollback

6. Record deploy
   +-- Append to .deploy-history log
```

---

## Rollback

### Automatic

If the deploy script's health check fails after deploying, it automatically rolls back:

1. Tags current (broken) images aside
2. Restores `:previous` tagged images
3. Restarts all services
4. Verifies health of rolled-back services

### Manual

```bash
ssh root@72.62.235.90
cd /opt/kenchi

# Option 1: Roll back to previous git SHA
cat .rollback-sha  # see what we're rolling back to
git checkout $(cat .rollback-sha)
docker compose -f docker-compose.prod.yml up --build -d

# Option 2: Roll back to previous Docker images (faster, no rebuild)
bash deploy/rollback.sh
```

---

## Health Checks

### Endpoints

Each service exposes three endpoints:

| Endpoint       | Purpose                             | Auth     | Docker Use             |
| -------------- | ----------------------------------- | -------- | ---------------------- |
| `GET /health`  | Liveness -- is the process running? | None     | Dockerfile HEALTHCHECK |
| `GET /ready`   | Readiness -- can it serve traffic?  | None     | Compose healthcheck    |
| `GET /metrics` | Prometheus metrics                  | Internal | Monitoring             |

### Readiness Checks

The `/ready` endpoint verifies:

- PostgreSQL connectivity (`SELECT 1`)
- Redis connectivity (`PING`)
- Returns `503 Service Unavailable` with `{ "ready": false }` if any dependency is down

Docker Compose uses `/ready` for health checks. If a service fails readiness, Docker restarts it automatically via `restart: unless-stopped`.

### Deploy Hash Verification

Each service includes `DEPLOY_HASH` (the git SHA) in its `/health` response. After a deploy, the script verifies all services report the same hash, catching partial deploy issues.

---

## Database

### Password Sync

PostgreSQL's `POSTGRES_PASSWORD` env var only applies on first volume initialization. If the password changes in `.env` after the volume exists, PostgreSQL silently rejects the new password.

**Guard:** `database/sync-password.sh` runs on every postgres container start. It uses local (trust) auth to `ALTER USER` the password, ensuring it always matches `POSTGRES_PASSWORD`.

### Migrations

Migrations live in `database/init/` as numbered SQL files (`001_schema.sql`, `002_tenants.sql`, etc.). They run via `/docker-entrypoint-initdb.d/` on first init. For existing databases, the API service runs pending migrations on startup.

### Backups

```bash
# Manual backup
ssh root@72.62.235.90
docker exec kenchi-postgres pg_dump -U kenchi kenchi | gzip > /backups/kenchi-$(date +%Y%m%d).sql.gz
```

---

## Monitoring

### Health Monitor Workflow

A GitHub Actions cron job runs every 5 minutes:

- Curls `https://kenchiops.app/health`
- If unhealthy, creates a GitHub issue with the `incident` label
- Sends a Slack notification to the incident webhook

### Log Management

All services use Docker's `json-file` logging driver with rotation:

- Max 10MB per log file
- Max 3 files per container
- Prevents disk exhaustion on the 4GB VPS

### Viewing Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs --tail=50

# Specific service
docker compose -f docker-compose.prod.yml logs api --tail=100

# Follow logs in real-time
docker compose -f docker-compose.prod.yml logs -f api

# Filter for errors only
docker compose -f docker-compose.prod.yml logs api | grep '"level":3'
```

Log levels: `1=info`, `2=warn`, `3=error`, `4=fatal`

---

## Incident Runbooks

### Service Returning 500 / INTERNAL_ERROR

```bash
# 1. Check which service is failing
docker compose -f docker-compose.prod.yml ps

# 2. Check logs for the failing service
docker compose -f docker-compose.prod.yml logs api --tail=50

# 3. Common causes:
#    - "password authentication failed" -> DB password desync (restart postgres)
#    - "SASL: client password must be a string" -> POSTGRES_PASSWORD env var empty
#    - "ERR_MODULE_NOT_FOUND" -> missing production dependency (check devDependencies)
```

### INTERNAL_SERVICE_SECRET Mismatch (401 between services)

```bash
# Verify all services have the same secret
diff <(docker compose exec api printenv INTERNAL_SERVICE_SECRET) \
     <(docker compose exec github-app printenv INTERNAL_SERVICE_SECRET)

# Fix: recreate all services from the same .env
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### Database Connection Failures

```bash
# 1. Check postgres is running
docker compose -f docker-compose.prod.yml ps postgres

# 2. Test direct connection inside postgres container
docker compose exec postgres psql -U kenchi -d kenchi -c "SELECT 1"

# 3. Test network connection from API container
docker compose exec api node -e "
  const { Pool } = require('pg');
  const p = new Pool({connectionString: process.env.DATABASE_URL});
  p.query('SELECT 1').then(r => { console.log('OK'); p.end(); })
    .catch(e => { console.error('FAIL', e.message); p.end(); })
"

# 4. If password mismatch, reset it:
docker compose exec postgres psql -U kenchi -d kenchi \
  -c "ALTER USER kenchi PASSWORD '<password-from-env>'"
docker compose -f docker-compose.prod.yml restart api github-app slack-bot incident-triage
```

### GitLab Token Expired

The system auto-refreshes GitLab tokens on every login and proactively before they expire. If a user sees "Token is expired":

1. Ask them to log out and log back in with GitLab -- this syncs fresh tokens
2. Check logs: `docker compose logs api --tail=50 | grep -i gitlab`
3. If refresh is failing, verify `GITLAB_OAUTH_CLIENT_ID` and `GITLAB_OAUTH_CLIENT_SECRET` in secrets

### Service Won't Start (Dependency Error)

```bash
# Check if it's a missing package
docker compose logs api --tail=20
# If "Cannot find package X":
# 1. Check if X is in dependencies (not devDependencies) in package.json
# 2. Rebuild: docker compose up --build -d
```

### Full System Recovery

If everything is broken:

```bash
ssh root@72.62.235.90
cd /opt/kenchi

# 1. Verify secrets are intact
cat /etc/kenchi/.env.production | head -5

# 2. Pull known-good code
git fetch origin main
git reset --hard origin/main

# 3. Rebuild everything from scratch
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up --build -d

# 4. Wait and verify
sleep 30
docker compose -f docker-compose.prod.yml ps
```

---

## Incident History

| Date       | Incident                                          | Root Cause                                                   | Fix                                        | Prevention                                       |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------ |
| 2026-03-07 | All API requests return INTERNAL_ERROR            | Postgres password desync after volume recreate               | `ALTER USER` to resync password            | `sync-password.sh` runs on every container start |
| 2026-03-07 | API won't start: ERR_MODULE_NOT_FOUND compression | `compression` in devDependencies, excluded from prod install | Moved to dependencies                      | CI dependency validation                         |
| 2026-03-09 | rsync overwrote production .env                   | Manual rsync from dev machine                                | Restored .env, recreated services          | Secrets at `/etc/kenchi/`, no rsync              |
| 2026-03-09 | "Invalid internal authentication signature" 401   | INTERNAL_SERVICE_SECRET differs between API and github-app   | Recreated all services                     | Atomic deploys (always rebuild all)              |
| 2026-03-09 | GitLab "Token is expired" on dashboard            | Login only synced refresh token, not access token            | `syncGitLabTokens` now syncs all tokens    | Tokens synced on every login                     |
| 2026-03-09 | GitHub App reinstall prompt after GitLab login    | Tenant context stuck on GitLab org                           | Auto-select tenant matching login provider | Provider-aware tenant selection                  |

---

## Implementation Plan

### Tier 1: Secrets Protection (Immediate) — DONE

**Goal:** Production secrets can never be accidentally overwritten.

| Task                            | File                                            | Change                                                                  | Status  |
| ------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| Update env_file paths           | `docker-compose.prod.yml`                       | Changed `env_file: - .env` to `env_file: - /etc/kenchi/.env.production` | ✅ Done |
| Update production template      | `deploy/.env.production.template`               | Updated instructions to use `/etc/kenchi/.env.production`               | ✅ Done |
| Add env separation comments     | `docker-compose.yml`, `docker-compose.prod.yml` | Clarify which env file each compose reads                               | ✅ Done |
| Move secrets on VPS             | VPS filesystem                                  | Created `/etc/kenchi/.env.production`, `chmod 0600`, `chattr +i`        | ✅ Done |
| Add `.env.*` to `.dockerignore` | `.dockerignore`                                 | Added `.env.*` glob to block all env variants                           | ✅ Done |

### Tier 2: Automated CI/CD Pipeline — DONE

**Goal:** Humans never touch production. Code flows: PR -> main -> auto-deploy.

| Task                        | File                       | Change                                                      | Status  |
| --------------------------- | -------------------------- | ----------------------------------------------------------- | ------- |
| Create server deploy script | `deploy/server-deploy.sh`  | Pre-flight, backup, pull, build, verify, auto-rollback      | ✅ Done |
| Update CI deploy job        | `.github/workflows/ci.yml` | Calls `server-deploy.sh` instead of inline commands         | ✅ Done |
| Replace rsync deploy        | `deploy/deploy.sh`         | Replaced rsync with git-based deploy via `server-deploy.sh` | ✅ Done |
| Update VPS setup            | `deploy/setup-vps.sh`      | References `/etc/kenchi/.env.production` path               | ✅ Done |

### Tier 3: Rollback Strategy — DONE

**Goal:** Bad deploys are reversed in under 60 seconds.

| Task                     | File                      | Change                                                | Status  |
| ------------------------ | ------------------------- | ----------------------------------------------------- | ------- |
| Create rollback script   | `deploy/rollback.sh`      | Manual rollback to previous or specific SHA           | ✅ Done |
| Tag images before deploy | `deploy/server-deploy.sh` | Tags current images as `:previous` before rebuild     | ✅ Done |
| Deploy history log       | `deploy/server-deploy.sh` | Appends SHA + timestamp + status to `.deploy-history` | ✅ Done |
| Auto-rollback on failure | `deploy/server-deploy.sh` | Health check fails → auto restore previous SHA        | ✅ Done |

### Tier 4: Enhanced Health Checks — DONE

**Goal:** Unhealthy services are detected and restarted automatically.

| Task                        | File                                        | Change                                                   | Status  |
| --------------------------- | ------------------------------------------- | -------------------------------------------------------- | ------- |
| Switch to `/ready` endpoint | `docker-compose.prod.yml`                   | All healthchecks now use `/ready` (checks DB + Redis)    | ✅ Done |
| Add `start_period: 30s`     | `docker-compose.prod.yml`                   | Services get 30s to initialize before first health check | ✅ Done |
| Add deploy hash to health   | `packages/shared/src/health/healthCheck.ts` | `DEPLOY_HASH` env var included in `/health` response     | ✅ Done |
| Add `DEPLOY_HASH` to config | `packages/shared/src/core/config.ts`        | Added via shared config (not `process.env` directly)     | ✅ Done |
| Add logging limits          | `docker-compose.prod.yml`                   | All 8 containers: `max-size: 10m, max-file: 3`           | ✅ Done |
| Deploy hash verification    | `deploy/server-deploy.sh`                   | Post-deploy verifies API reports correct hash            | ✅ Done |

### Tier 5: Pre-Deploy Validation — DONE

**Goal:** Broken builds never reach production.

| Task                         | File                            | Change                                                                       | Status  |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------- | ------- |
| Dependency validation script | `scripts/validate-prod-deps.ts` | Scans imports, verifies all are in `dependencies` not just `devDependencies` | ✅ Done |
| Add to CI pipeline           | `.github/workflows/ci.yml`      | `npm run check:prod-deps` runs after build step                              | ✅ Done |
| Docker smoke test            | `.github/workflows/ci.yml`      | Starts each service in Docker, catches `ERR_MODULE_NOT_FOUND`                | ✅ Done |
| npm script                   | `package.json`                  | Added `check:prod-deps` script                                               | ✅ Done |

### Tier 6: Monitoring — DONE

**Goal:** Know when things break before users report it.

| Task                  | File                                   | Change                                                        | Status  |
| --------------------- | -------------------------------------- | ------------------------------------------------------------- | ------- |
| Health monitor cron   | `.github/workflows/health-monitor.yml` | Every 5 min, curls `/health`, creates GitHub issue on failure | ✅ Done |
| Deploy failure alerts | `.github/workflows/ci.yml`             | Deploy job logs error with rollback info on failure           | ✅ Done |

---

## Pre-Deploy Checklist

Before any production deploy:

- [ ] All CI checks pass (lint, type-check, tests, build)
- [ ] No runtime imports from `devDependencies` only
- [ ] Docker build completes without errors
- [ ] No `.env` files in the deploy payload
- [ ] Deploy rebuilds ALL services, not a subset
- [ ] Post-deploy: all containers show `(healthy)` in `docker compose ps`
- [ ] Post-deploy: no error-level logs in first 60 seconds

---

## Server Access

```bash
# SSH to production
ssh root@72.62.235.90

# Project directory
cd /opt/kenchi

# Secrets (requires root)
cat /etc/kenchi/.env.production

# Docker commands always use the prod compose file
docker compose -f docker-compose.prod.yml <command>
```
