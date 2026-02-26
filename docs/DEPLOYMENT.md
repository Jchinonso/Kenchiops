# Kenchi Production Deployment Guide

## Infrastructure Overview

| Component  | Details                                             |
| ---------- | --------------------------------------------------- |
| **VPS**    | Hostinger KVM 2 — Ubuntu 25.10, 8GB RAM, 100GB disk |
| **IP**     | `72.62.235.90`                                      |
| **Domain** | `kenchiops.app` (registered on name.com)            |
| **SSL**    | Automatic via Caddy (Let's Encrypt)                 |
| **CI/CD**  | GitHub Actions — auto-deploy on push to `main`      |

## Architecture

```
Internet → Caddy (:443 HTTPS) → frontend nginx (:80)
                                    ├── /api/        → api :3000
                                    ├── /auth/       → api :3000
                                    ├── /webhooks/   → api :3000
                                    └── /health      → api :3000
         Caddy also routes:
              /webhooks/github  → github-app :3002
              /github/setup     → github-app :3002
              /slack/*          → slack-bot :3001
```

All services run in Docker containers on a single VPS. Caddy handles HTTPS termination with automatic certificate renewal. No ports are exposed to the host except 80 and 443 (via Caddy).

---

## Setup Steps (What We Did)

### 1. DNS Configuration

**Where:** name.com → kenchiops.app → Manage Nameservers

- Switched nameservers to **name.com defaults** (were previously on Hostinger's `mysecurecloudhost.com`)
- Added two A records on name.com:

| Type | Host        | Answer         | TTL |
| ---- | ----------- | -------------- | --- |
| A    | `@` (blank) | `72.62.235.90` | 300 |
| A    | `www`       | `72.62.235.90` | 300 |

### 2. VPS Provisioning

**Where:** SSH into `root@72.62.235.90`

Docker and Git were already installed on the Hostinger VPS. We configured:

- **UFW Firewall** — allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS) only
- **App directory** — `/opt/kenchi`

Script: `deploy/setup-vps.sh` (run once on fresh VPS)

### 3. GitHub Deploy Key

**Where:** GitHub → kenchiops/Kenchiops → Settings → Deploy keys

- Generated an ED25519 SSH key on the VPS (`~/.ssh/kenchi_deploy`)
- Added the public key to GitHub as a read-only deploy key
- Configured `~/.ssh/config` to use this key for `github.com`

### 4. Clone Repository

```bash
cd /opt/kenchi
git clone git@github.com:kenchiops/Kenchiops.git .
git checkout feat/production-deployment
```

### 5. Production Environment Variables

**File:** `/opt/kenchi/.env` (never committed to git)

Generated fresh security secrets on the VPS:

```bash
# Auto-generated
POSTGRES_PASSWORD=<openssl rand -hex 32>
JWT_SECRET=<openssl rand -hex 64>
ENCRYPTION_KEY=<openssl rand -hex 32>
INTERNAL_SERVICE_SECRET=<openssl rand -hex 32>
```

App secrets copied from local dev environment:

- `LLM_*` — OpenRouter API config
- `OPENAI_API_KEY` — OpenAI fallback
- `SLACK_*` — Slack bot tokens
- `GITHUB_APP_*` — GitHub App credentials
- `GITHUB_OAUTH_*` — GitHub OAuth (login)
- `GITLAB_OAUTH_*` — GitLab OAuth (login)
- `EXTRACTION_MODEL` — AI model for chunk extraction

Template: `deploy/.env.production.template`

### 6. Docker Compose Deploy

```bash
cd /opt/kenchi
docker compose -f docker-compose.prod.yml up --build -d
```

Services deployed:

- **postgres** — PostgreSQL 16 with pgvector (512MB limit)
- **redis** — Redis 7 Alpine (192MB limit)
- **api** — Main API server, port 3000 (384MB limit)
- **slack-bot** — Slack event handler, port 3001 (384MB limit)
- **github-app** — GitHub webhook handler, port 3002 (512MB limit)
- **incident-triage** — Incident triage service, port 3004 (384MB limit)
- **frontend** — React SPA served by nginx (128MB limit)
- **caddy** — HTTPS reverse proxy (128MB limit)

---

## CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

On every push to `main`:

1. **Lint** — ESLint + Prettier
2. **Type Check** — TypeScript compilation
3. **Test** — Unit tests
4. **Build** — Full monorepo build
5. **Code Quality** — Duplication check
6. **Security** — npm audit
7. **Docker** — Docker image build
8. **Deploy** — SSH into VPS, pull latest, rebuild containers, health check

The deploy job uses `appleboy/ssh-action` with GitHub Secrets:

- `VPS_HOST` — VPS IP address
- `VPS_USER` — SSH user (root)
- `VPS_SSH_KEY` — SSH private key

### GitHub Secrets Required

Add in GitHub → repo Settings → Secrets and variables → Actions:

| Secret        | Value                                          |
| ------------- | ---------------------------------------------- |
| `VPS_HOST`    | `72.62.235.90`                                 |
| `VPS_USER`    | `root`                                         |
| `VPS_SSH_KEY` | Contents of the SSH private key for VPS access |

---

## Key Files

| File                              | Purpose                                          |
| --------------------------------- | ------------------------------------------------ |
| `docker-compose.prod.yml`         | Production Docker Compose (all services + Caddy) |
| `deploy/Caddyfile`                | HTTPS routing rules                              |
| `deploy/setup-vps.sh`             | One-time VPS provisioning script                 |
| `deploy/deploy.sh`                | Manual deploy script (rsync-based)               |
| `deploy/.env.production.template` | Env var template                                 |
| `.github/workflows/ci.yml`        | CI/CD pipeline with deploy job                   |

---

## Manual Deploy (without CI/CD)

```bash
# From local machine
./deploy/deploy.sh

# Or SSH in directly
ssh root@72.62.235.90
cd /opt/kenchi
git pull origin main
docker compose -f docker-compose.prod.yml up --build -d
```

---

## Post-Deployment: GitHub App Settings

Update these in GitHub → Developer Settings → GitHub Apps → kenchi-devops:

| Setting          | Value                                        |
| ---------------- | -------------------------------------------- |
| **Webhook URL**  | `https://kenchiops.app/webhooks/github`      |
| **Setup URL**    | `https://kenchiops.app/github/setup`         |
| **Callback URL** | `https://kenchiops.app/auth/github/callback` |
| **Homepage URL** | `https://kenchiops.app`                      |
| **Public**       | Yes (so users can install it)                |

---

## Post-Deployment: GitLab OAuth Settings

Update these in GitLab → User Settings → Applications (or Group → Settings → Applications):

| Setting           | Value                                                |
| ----------------- | ---------------------------------------------------- |
| **Name**          | Kenchi DevOps                                        |
| **Redirect URIs** | `https://kenchiops.app/auth/gitlab/callback`         |
| **Confidential**  | Yes                                                  |
| **Scopes**        | `read_user`, `read_api`, `read_repository`, `openid` |

For local development, add these additional redirect URIs (one per line):

```
http://localhost:5173/auth/gitlab/callback
http://localhost:3003/auth/gitlab/callback
```

> **Tip:** GitLab allows multiple redirect URIs in a single application — add all environments so you don't need separate apps for dev vs production.

---

## Useful Commands

```bash
# SSH into VPS
ssh root@72.62.235.90

# View running containers
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f           # all services
docker compose -f docker-compose.prod.yml logs -f api       # specific service

# Restart a service
docker compose -f docker-compose.prod.yml restart api

# Rebuild and redeploy
docker compose -f docker-compose.prod.yml up --build -d

# Check disk/memory usage
df -h / && free -h

# Database shell
docker compose -f docker-compose.prod.yml exec postgres psql -U kenchi -d kenchi
```

---

## Troubleshooting

**Containers not starting:**

```bash
docker compose -f docker-compose.prod.yml logs --tail=50
```

**DNS not resolving:**

```bash
dig kenchiops.app A +short
# Should return 72.62.235.90
```

**SSL certificate issues:**

```bash
docker compose -f docker-compose.prod.yml logs caddy
# Caddy auto-provisions certs; check for ACME errors
```

**Health check:**

```bash
docker compose -f docker-compose.prod.yml exec api \
  node -e "require('http').get('http://localhost:3000/health', (r) => { let d=''; r.on('data', c => d+=c); r.on('end', () => console.log(d)); })"
```
