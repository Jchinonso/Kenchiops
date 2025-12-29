# Kenchi - AI-Driven DevOps Assistant

[![CI](https://github.com/kenchiops/Kenchiops/actions/workflows/ci.yml/badge.svg)](https://github.com/kenchiops/Kenchiops/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3+-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

An AI-powered DevOps assistant that automatically analyzes CI/CD failures, identifies root causes, and provides actionable insights via Slack and GitHub. Built with a safety-first architecture where the LLM is treated as an untrusted helper.

## Key Features

- **Automatic CI Failure Analysis** - Analyzes build failures, test failures, and deployment issues using GPT-4
- **Multi-Language Support** - Works with any programming language (TypeScript, Python, Go, Rust, Java, Ruby, etc.)
- **Rich Slack Notifications** - Interactive messages with approval buttons, confidence scores, and recommended actions
- **GitHub PR Comments** - Detailed analysis posted directly on pull requests with error locations and fixes
- **Failure Aggregation** - Consolidates multiple related failures before analysis to reduce noise
- **Redis Caching** - Intelligent caching of GitHub data and analysis results to minimize API calls
- **Multi-Tenant Architecture** - Single deployment serves multiple GitHub installations and Slack workspaces
- **Safety-First Design** - Confidence scoring, action gating, and human-in-the-loop approvals

## Architecture Overview

```
                              GitHub Webhooks
                                     |
                                     v
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   GitHub App    │     │    Slack Bot    │     │   API Service   │
│   (Port 3002)   │     │   (Port 3001)   │     │   (Port 3000)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │     @kenchi/shared      │
                    │  (Core utilities, AI,   │
                    │   caching, formatting)  │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
        ┌─────┴─────┐     ┌─────┴─────┐     ┌─────┴─────┐
        │   Redis   │     │ PostgreSQL │     │  OpenAI   │
        │  (Cache,  │     │  (Tenants, │     │  (GPT-4   │
        │  Queues)  │     │  Mappings) │     │  Analysis)│
        └───────────┘     └───────────┘     └───────────┘
```

## Project Structure

```
kenchi/
├── packages/
│   └── shared/                 # Shared library used by all services
│       └── src/
│           ├── core/           # Config, logging, errors, types
│           ├── cache/          # Redis caching (GitHub, tenant, analysis)
│           ├── queue/          # Redis message queues and pub/sub
│           ├── aggregation/    # CI failure aggregation and consolidation
│           ├── openaiClient/   # OpenAI integration with validation
│           ├── safety/         # Confidence scoring, action gating
│           ├── database/       # PostgreSQL tenant management
│           ├── http/           # Middleware, rate limiting, validation
│           ├── formatting/     # Slack/GitHub message formatting
│           ├── actions/        # Action execution queue
│           ├── integrations/   # GitHub client, prompt building
│           ├── security/       # Secret redaction
│           └── constants/      # All application constants
│
├── services/
│   ├── api/                    # Central API service (Port 3000)
│   │   └── src/
│   │       ├── routes/         # Health, webhook, event, analysis routes
│   │       └── services/       # Analysis orchestration
│   │
│   ├── slack-bot/              # Slack integration (Port 3001)
│   │   └── src/
│   │       ├── handlers/       # Commands, mentions, actions, modals
│   │       ├── formatters/     # CI failure message formatting
│   │       ├── routes/         # OAuth, HTTP endpoints
│   │       └── services/       # Notifications, tenant client
│   │
│   └── github-app/             # GitHub App (Port 3002)
│       └── src/
│           ├── handlers/       # Check run, PR, installation handlers
│           ├── formatters/     # PR comments, Slack payloads
│           ├── services/       # Context gathering, aggregation
│           └── routes/         # Webhooks, API, setup
│
├── docs/                       # Documentation
├── database/                   # SQL migrations
└── docker-compose.yml          # Container orchestration
```

## How It Works

### CI Failure Analysis Flow

1. **Webhook Received** - GitHub sends check_run webhook when CI fails
2. **Context Gathering** - Fetches logs, annotations, PR diff, commit info in parallel
3. **Failure Aggregation** - Waits briefly (debounce) to consolidate related failures
4. **AI Analysis** - GPT-4 analyzes the failure with structured output
5. **Confidence Scoring** - Deterministic validation of AI suggestions
6. **Notification** - Posts rich message to Slack and GitHub PR comment
7. **Action Approval** - User can approve/reject suggested actions via buttons
8. **Execution** - Approved actions executed asynchronously

### Safety Architecture

The LLM is treated as an **untrusted helper**:

- LLM provides **suggestions only** - never executes commands directly
- All outputs are **validated** by deterministic code before action
- **Confidence scoring** gates which actions require human approval
- **Action classification** blocks dangerous operations entirely

| Confidence | Risk Level | Behavior                           |
| ---------- | ---------- | ---------------------------------- |
| 0.85+      | Low/Medium | Auto-approve safe actions          |
| 0.70-0.85  | Medium     | Require approval for risky actions |
| 0.50-0.70  | High       | Require approval for all actions   |
| < 0.50     | Critical   | Block all actions, require review  |

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- OpenAI API key
- GitHub App credentials
- Slack App credentials

### Quick Start with Docker

1. **Clone and configure**:

   ```bash
   git clone https://github.com/kenchiops/Kenchiops.git
   cd kenchi
   cp .env.example .env
   ```

2. **Set environment variables** in `.env`:

   ```env
   # Required
   OPENAI_API_KEY=sk-...
   GITHUB_APP_ID=123456
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
   GITHUB_WEBHOOK_SECRET=your-webhook-secret
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_APP_TOKEN=xapp-...

   # Optional (defaults provided)
   DATABASE_URL=postgres://kenchi:kenchi@postgres:5432/kenchi
   REDIS_URL=redis://redis:6379
   ```

3. **Start services**:

   ```bash
   docker compose up -d
   ```

4. **Verify health**:
   ```bash
   curl http://localhost:3000/health  # API
   curl http://localhost:3001/health  # Slack Bot
   curl http://localhost:3002/health  # GitHub App
   ```

### Local Development

```bash
# Install dependencies
npm install

# Build shared package (required first)
npm run build:shared

# Start individual services with hot reload
npm run dev:api
npm run dev:slack-bot
npm run dev:github-app
```

## Services

### API Service (Port 3000)

Central orchestration service for AI analysis.

| Endpoint           | Method | Description                 |
| ------------------ | ------ | --------------------------- |
| `/health`          | GET    | Health check                |
| `/api/analyze`     | POST   | Trigger CI failure analysis |
| `/webhook/:source` | POST   | Webhook ingestion           |
| `/events`          | POST   | Event processing            |

### Slack Bot Service (Port 3001)

Slack integration using Socket Mode (WebSocket).

**Features**:

- `/kenchi` slash command
- Interactive approval buttons
- App Home configuration
- Repository selection modal
- CI failure notifications

### GitHub App Service (Port 3002)

GitHub webhook processing and PR integration.

**Features**:

- Check run failure detection
- PR comment posting with analysis
- Check annotations creation
- Webhook signature verification
- Rate-limited GitHub API access

## Configuration

### Environment Variables

| Variable                 | Required | Description                          |
| ------------------------ | -------- | ------------------------------------ |
| `OPENAI_API_KEY`         | Yes      | OpenAI API key for GPT-4             |
| `GITHUB_APP_ID`          | Yes      | GitHub App ID                        |
| `GITHUB_APP_PRIVATE_KEY` | Yes      | GitHub App private key (PEM format)  |
| `GITHUB_WEBHOOK_SECRET`  | Yes      | GitHub webhook secret                |
| `SLACK_BOT_TOKEN`        | Yes      | Slack bot token (xoxb-...)           |
| `SLACK_SIGNING_SECRET`   | Yes      | Slack signing secret                 |
| `SLACK_APP_TOKEN`        | Yes      | Slack app-level token (xapp-...)     |
| `DATABASE_URL`           | No       | PostgreSQL connection string         |
| `REDIS_URL`              | No       | Redis connection string              |
| `NODE_ENV`               | No       | Environment (development/production) |

### Redis Caching

Redis is used for:

- **Caching** - GitHub API responses, tenant data, analysis results
- **Message Queues** - CI analysis, Slack notifications, action execution
- **Aggregation** - Consolidating failures before analysis

Default TTLs:

- GitHub repositories: 1 hour
- Pull requests: 30 minutes
- Analysis results: 24 hours
- Tenant configs: 2 hours

## Development

### Scripts

```bash
npm run build           # Build all packages
npm run build:shared    # Build shared package only
npm run test            # Run tests
npm run test:coverage   # Run tests with coverage
npm run lint            # Check code quality
npm run lint:fix        # Auto-fix lint issues
npm run format          # Format code with Prettier
npm run type-check      # TypeScript type checking
npm run check:duplication  # Check for code duplication
```

### Code Quality Standards

- **Functional patterns** - No imperative loops, use map/filter/reduce
- **Typed errors** - All errors use typed classes from `@kenchi/shared`
- **Immutability** - Prefer `const`, avoid mutations
- **Lookup tables** - Replace switch statements with handler maps
- **Zero duplication** - All shared code in `@kenchi/shared`

### Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
npm test -- --testPathPattern="slack-bot"  # Specific service
```

## Docker

### Services

| Service      | Port | Description              |
| ------------ | ---- | ------------------------ |
| `api`        | 3000 | API service              |
| `slack-bot`  | 3001 | Slack bot                |
| `github-app` | 3002 | GitHub App               |
| `postgres`   | 5433 | PostgreSQL with pgvector |
| `redis`      | 6379 | Redis cache and queues   |

### Commands

```bash
docker compose up -d                    # Start all
docker compose down                     # Stop all
docker compose logs -f github-app      # View logs
docker compose restart github-app      # Restart service
docker compose up -d --build           # Rebuild and start
docker compose ps                       # Check status
```

## Multi-Tenant Architecture

Kenchi supports multiple GitHub installations and Slack workspaces:

1. **GitHub App Installation** - Creates tenant record (status: pending)
2. **Slack OAuth** - Links Slack workspace to tenant (status: active)
3. **Repository Mapping** - Configure which repos notify which Slack channels
4. **Request Handling** - Each webhook includes installation_id for tenant lookup

## Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Step-by-step setup guide
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - System architecture
- [CODE_ORGANIZATION.md](./docs/CODE_ORGANIZATION.md) - Code guidelines
- [DOCKER.md](./DOCKER.md) - Docker deployment guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines

## License

MIT

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
