# Quick Start Guide

Get Kenchi up and running in minutes!

## Prerequisites

- Docker and Docker Compose installed
- Git (to clone the repository)

## Step-by-Step Setup

### 1. Clone and Navigate

```bash
git clone <repository-url>
cd kenchi
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your credentials
# At minimum, you'll need placeholder values for:
# - OPENAI_API_KEY
# - SLACK_BOT_TOKEN
# - SLACK_SIGNING_SECRET
# - GITHUB_APP_ID
# - GITHUB_APP_PRIVATE_KEY
```

### 3. Start All Services

```bash
docker compose up -d
```

This starts:

- API Service (port 3000)
- Slack Bot Service (port 3001)
- GitHub App Service (port 3002)
- n8n (port 5678)

### 4. Verify Services

```bash
# Check status
docker compose ps

# Check logs
docker compose logs -f

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:5678/healthz
```

### 5. Setup n8n Workflow

1. Open n8n UI: http://localhost:5678
2. Login: `admin` / `admin123`
3. Go to "Workflows" → "Import from File"
4. Select: `n8n/workflows/ci-failure-analysis.json`
5. Activate the workflow (toggle switch ON)

### 6. Test the Workflow

Get the webhook URL from the "Webhook - CI Failure" node and test:

```bash
curl -X POST "http://localhost:5678/webhook-test/ci-failure" \
  -H "Content-Type: application/json" \
  -d '{
    "log": "Error: Unit tests failed",
    "repository": "kenchi",
    "branch": "main",
    "commit": "test123"
  }'
```

## Service URLs

- **API Service**: http://localhost:3000
- **Slack Bot Service**: http://localhost:3001
- **GitHub App Service**: http://localhost:3002
- **n8n**: http://localhost:5678

## Service Communication

All services run in the same Docker network. They communicate using service names:

- `http://api:3000` - API service
- `http://slack-bot:3001` - Slack bot service
- `http://github-app:3002` - GitHub app service

n8n workflows use these service names to call the services.

## Common Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# Restart a service
docker compose restart api

# Rebuild and restart
docker compose up -d --build
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:

```bash
# Stop conflicting services
docker compose down

# Or change ports in docker-compose.yml
```

### Services Can't Connect

Ensure all services are running:

```bash
docker compose ps
```

All services should show "Up" status.

### n8n Can't Reach Services

Verify n8n is in the same network:

```bash
docker inspect kenchi-n8n --format='{{range $net, $conf := .NetworkSettings.Networks}}{{$net}} {{end}}'
```

Should show `kenchi_default`.

## Next Steps

- Implement real OpenAI API integration
- Configure Slack credentials for actual message posting
- Add more workflows
- Set up database integration

See [README.md](./README.md) for more details.
