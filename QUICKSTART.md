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
- PostgreSQL (port 5433)

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
```

### 5. Test the CI Failure Flow

Send a test webhook to the GitHub App:

```bash
curl -X POST "http://localhost:3002/webhook/github" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: check_run" \
  -d '{
    "action": "completed",
    "check_run": {
      "id": 123,
      "name": "test",
      "conclusion": "failure",
      "output": {
        "title": "Test Failed",
        "summary": "Error: Unit tests failed"
      }
    },
    "repository": {
      "full_name": "test/repo"
    }
  }'
```

## Service URLs

- **API Service**: http://localhost:3000
- **Slack Bot Service**: http://localhost:3001
- **GitHub App Service**: http://localhost:3002

## Service Communication

All services run in the same Docker network. They communicate using service names:

- `http://api:3000` - API service
- `http://slack-bot:3001` - Slack bot service
- `http://github-app:3002` - GitHub app service

## CI Failure Analysis Flow

```
GitHub CI Failure (webhook)
    ↓
GitHub App (port 3002) - gather context
    ↓
API Service (port 3000) - OpenAI analysis
    ↓
Slack Bot (port 3001) - send notification
    ↓
Slack Workspace
```

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

### Check Service Logs

```bash
# View specific service logs
docker compose logs -f github-app
docker compose logs -f api
docker compose logs -f slack-bot
```

## Next Steps

- Configure Slack credentials for actual message posting
- Set up GitHub App webhook URL
- Configure OpenAI API key for real analysis
- Set up database integration

See [README.md](./README.md) for more details.
