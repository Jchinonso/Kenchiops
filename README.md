# Kenchi

An AI-powered DevOps assistant that analyzes CI/CD failures, triages production incidents, and surfaces actionable insights through a web dashboard, Slack, and GitHub. Built as a TypeScript monorepo with a safety-first architecture where the LLM is treated as an untrusted helper -- all AI suggestions are validated by deterministic code before any action is taken.

## Key Features

- **CI/CD Failure Analysis** -- Automatically analyzes build, test, and deployment failures using a multi-stage chunking pipeline with LLM-powered root cause identification
- **Incident Triage** -- Ingests alerts from PagerDuty, Datadog, Grafana, and Prometheus; classifies severity, correlates related incidents, and matches runbooks
- **Web Dashboard** -- React-based dashboard with real-time SSE updates, CI/CD analytics, failure history, webhook activity, and team management
- **GitHub Integration** -- Posts analysis comments on pull requests with error locations, confidence scores, and recommended fixes
- **Slack Notifications** -- Rich Block Kit messages with interactive approval buttons, confidence indicators, and threaded status updates
- **Multi-Tenant Architecture** -- Supports multiple GitHub organizations and Slack workspaces from a single deployment with tenant-scoped data isolation
- **RAG Knowledge Base** -- Retrieval-augmented generation using pgvector for similarity search across past incidents, runbooks, and resolution patterns
- **CI Provider Integrations** -- OAuth connections to Vercel and Netlify for deployment status and build log access
- **Safety-First Design** -- Confidence scoring, action gating, and human-in-the-loop approvals before any automated action

## Architecture

```
                       GitHub/GitLab       Monitoring         Users
                       Webhooks            Alerts
                           |                   |                |
                           v                   v                v
  +--------------------+  +------------------+  +--------------+  +------------+
  |   GitHub App       |  | Incident Triage  |  |  API Service |  |  Frontend  |
  |   (Port 3002)      |  | (Port 3004)      |  |  (Port 3000) |  |  (Port 80) |
  +--------+-----------+  +--------+---------+  +------+-------+  +------+-----+
           |                       |                    |                 |
           +-----------+-----------+--------------------+                 |
                       |                                                  |
                       v                                                  |
              +--------+--------+                                         |
              | @kenchi/shared   |                                         |
              | (Core utilities, |                                         |
              |  LLM, RAG, DB)   |                                        |
              +--------+--------+                                         |
                       |                                                  |
         +-------------+-------------+                                    |
         |             |             |                                    |
    +----+----+  +-----+-----+  +---+---+                                |
    | Postgres |  |   Redis   |  |  LLM  |                               |
    | pgvector |  |  (Cache,  |  | (via  |                               |
    |          |  |  Pub/Sub) |  | OpenAI/|                               |
    +----------+  +-----------+  | OpenRouter)                            |
                                 +--------+                               |
                                                                          |
  +---+--------+  +-----------+  +-----------+                            |
  | Prometheus |  | Grafana   |  | Alert-    |                            |
  | (Metrics)  |  | (Dashboards) | manager   |                            |
  +------------+  +-----------+  +-----------+                            |
                                                                          |
  +-----------+                                                           |
  | Slack Bot |  <--- Socket Mode connection to Slack                     |
  | (Port 3001)|                                                          |
  +-----------+                                                           |
```

## Project Structure

```
kenchi/
+-- packages/
|   +-- shared/                    # Shared library (@kenchi/shared)
|       +-- src/
|           +-- core/              # Config, logger, errors, types
|           +-- database/          # Repositories, migrations, domain types
|           +-- llm/               # LLM client, providers, token management
|           +-- rag/               # RAG pipeline, embeddings, search, ingestion
|           +-- finetuning/        # Fine-tuning dataset builder, model versioning
|           +-- billing/           # Stripe integration, plan enforcement
|           +-- cache/             # Redis caching (GitHub, tenant, analysis)
|           +-- queue/             # Redis message queues and pub/sub
|           +-- aggregation/       # CI failure aggregation and consolidation
|           +-- safety/            # Confidence scoring, action gating
|           +-- http/              # Middleware, httpClient, retry, timeout
|           +-- observability/     # Prometheus metrics, alerting, usage tracking
|           +-- rateLimit/         # Rate limiting middleware (plan-aware)
|           +-- security/          # Secret redaction, webhook signature verification
|           +-- formatting/        # Slack/GitHub message formatting
|           +-- constants/         # All application constants
|           +-- health/            # Health/readiness check utilities
|           +-- shutdown/          # Graceful shutdown handlers
|           +-- actions/           # Action proposal execution queue
|           +-- integrations/      # GitHub client, prompt building
|           +-- ports/             # Port interfaces for adapters
|           +-- concurrency/       # pMap, bounded concurrency utilities
|           +-- index.ts           # Barrel exports
|
+-- services/
|   +-- api/                       # Central API service (Port 3000)
|   |   +-- src/
|   |       +-- routes/            # HTTP handlers (auth, dashboard, webhooks, etc.)
|   |       +-- services/          # Business logic (analysis, auth, integrations)
|   |       +-- ports/             # Port interface definitions
|   |       +-- adapters/          # External service adapters
|   |
|   +-- github-app/                # GitHub App webhook processor (Port 3002)
|   |   +-- src/
|   |       +-- handlers/          # Check run, PR, installation event handlers
|   |       +-- services/          # Context gathering, aggregation
|   |       +-- adapters/          # GitHub API adapters
|   |       +-- routes/            # Webhook endpoints
|   |
|   +-- slack-bot/                 # Slack Bot integration (Port 3001)
|   |   +-- src/
|   |       +-- handlers/          # Commands, mentions, actions, modals
|   |       +-- formatters/        # CI failure message formatting
|   |       +-- services/          # Notifications, tenant client
|   |       +-- routes/            # OAuth, HTTP endpoints
|   |
|   +-- incident-triage/           # Incident triage pipeline (Port 3004)
|   |   +-- src/
|   |       +-- adapters/          # PagerDuty, Datadog, Grafana, Prometheus, etc.
|   |       +-- services/          # Severity classifier, dedup, correlation, dispatch
|   |       +-- workers/           # Triage and investigation background workers
|   |       +-- routes/            # Alert webhook and investigation endpoints
|   |       +-- prompts/           # LLM prompt templates for triage
|   |
|   +-- frontend/                  # Web dashboard (React SPA, Port 3003/80)
|       +-- src/
|           +-- pages/             # Dashboard, CI/CD views, Settings, Integrations
|           +-- components/        # Shared UI components (shadcn/ui)
|           +-- hooks/             # Custom React hooks (SSE, auth, data fetching)
|           +-- lib/               # Utilities (cn, formatters, API client)
|
+-- infra/                         # Monitoring infrastructure configs
|   +-- prometheus/                # Prometheus config, recording rules, alerts
|   +-- grafana/                   # Grafana provisioning and dashboards
|   +-- alertmanager/              # Alertmanager configuration
|
+-- docs/                          # Project documentation
+-- database/                      # Database initialization scripts
+-- docker-compose.yml             # Full stack orchestration
+-- Dockerfile                     # Multi-stage production build
```

## Tech Stack

| Category          | Technology                                               |
| ----------------- | -------------------------------------------------------- |
| Language          | TypeScript 5.3+, ES Modules                              |
| Runtime           | Node.js 20+                                              |
| Backend Framework | Express.js                                               |
| Frontend          | React 19, React Router v7, Tailwind CSS, shadcn/ui       |
| State Management  | TanStack Query, native EventSource (SSE)                 |
| Database          | PostgreSQL 16 with pgvector                              |
| Cache / Queues    | Redis 7                                                  |
| LLM               | OpenAI SDK (supports OpenRouter for model routing)       |
| Slack             | Slack Bolt Framework (Socket Mode)                       |
| GitHub            | Octokit                                                  |
| Monitoring        | Prometheus, Grafana, Alertmanager                        |
| Billing           | Stripe                                                   |
| Build             | npm workspaces, TypeScript project references            |
| Testing           | Jest (backend), Vitest (frontend), React Testing Library |
| Linting           | ESLint, Prettier, Husky + lint-staged                    |
| Containerization  | Docker, Docker Compose                                   |

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ (for local development)
- A GitHub App with webhook secret and private key
- A Slack App with bot token and signing secret
- An LLM API key (OpenAI or OpenRouter)

### Quick Start with Docker

1. Clone and configure:

   ```bash
   git clone https://github.com/kenchiops/Kenchiops.git
   cd kenchi
   cp .env.example .env
   ```

2. Edit `.env` with your credentials (see [Environment Variables](#environment-variables) below).

3. Start the full stack:

   ```bash
   docker compose up -d
   ```

4. Verify services are healthy:

   ```bash
   curl http://localhost:3000/health    # API
   curl http://localhost:3001/health    # Slack Bot
   curl http://localhost:3002/health    # GitHub App
   curl http://localhost:3004/health    # Incident Triage
   ```

5. Open the dashboard at `http://localhost:3003`.

### Local Development

```bash
# Install dependencies
npm install

# Build the shared package (required before running any service)
npm run build:shared

# Start individual services with hot reload
npm run dev:api          # API on port 3000
npm run dev:slack-bot    # Slack Bot on port 3001
npm run dev:github-app   # GitHub App on port 3002
npm run dev:frontend     # Frontend on port 5173 (Vite)
```

Note: PostgreSQL and Redis must be running locally or via Docker. You can start only the infrastructure:

```bash
docker compose up -d postgres redis
```

## Services

### API Service (Port 3000)

Central orchestration service. Handles authentication, analysis orchestration, dashboard data, team management, billing, and integrations.

Key route groups: auth (OAuth login/callback), dashboard (stats, repositories, analyses, failures), webhooks, CI/CD analysis, RAG document management, fine-tuning, risk rules, SSE (real-time events), integrations (Vercel/Netlify OAuth), subscriptions, organizations, teams, invitations, API keys, billing (Stripe), and data export.

### GitHub App (Port 3002)

Processes GitHub webhooks for CI/CD events. Detects check run failures, gathers enriched context (logs, annotations, PR diffs, commit history), triggers AI analysis, and posts results as PR comments.

### Slack Bot (Port 3001)

Slack integration using Socket Mode (persistent WebSocket). Handles `/kenchi` slash commands, interactive approval buttons, app home configuration, repository selection modals, and CI failure notifications with rich Block Kit formatting.

### Incident Triage (Port 3004)

Ingests alerts from monitoring tools (PagerDuty, Datadog, Grafana, Prometheus, Vercel, Netlify) via webhooks. Runs a triage pipeline: severity classification, incident deduplication and correlation, evidence aggregation, runbook matching, AI-powered summarization, and dispatch to Slack or PagerDuty.

### Frontend (Port 3003 in Docker, Port 5173 in dev)

React single-page application. Features include: dashboard overview with real-time stats, CI/CD analysis detail views, failure history, webhook activity monitoring, active incidents, on-demand investigations, repository details, team management, settings (profile, notifications, billing, subscriptions), integrations (Vercel, Netlify, GitLab CI), and onboarding flows. Uses Server-Sent Events for live updates.

## Environment Variables

Copy `.env.example` for the full list. Key variables:

| Variable                     | Required | Description                                                |
| ---------------------------- | -------- | ---------------------------------------------------------- |
| `OPENAI_API_KEY`             | Yes      | OpenAI API key (or set `LLM_API_KEY` for OpenRouter)       |
| `GITHUB_APP_ID`              | Yes      | GitHub App ID                                              |
| `GITHUB_APP_PRIVATE_KEY`     | Yes      | GitHub App private key (PEM format)                        |
| `GITHUB_WEBHOOK_SECRET`      | Yes      | GitHub webhook signing secret                              |
| `GITHUB_OAUTH_CLIENT_ID`     | Yes      | GitHub OAuth client ID (for user login)                    |
| `GITHUB_OAUTH_CLIENT_SECRET` | Yes      | GitHub OAuth client secret                                 |
| `SLACK_BOT_TOKEN`            | Yes      | Slack bot token (`xoxb-...`)                               |
| `SLACK_SIGNING_SECRET`       | Yes      | Slack app signing secret                                   |
| `SLACK_APP_LEVEL_TOKEN`      | Yes      | Slack app-level token (`xapp-...`) for Socket Mode         |
| `JWT_SECRET`                 | Yes      | JWT signing secret (min 32 chars)                          |
| `DATABASE_URL`               | No       | PostgreSQL connection string (defaults provided in Docker) |
| `REDIS_URL`                  | No       | Redis connection string (defaults provided in Docker)      |
| `ENCRYPTION_KEY`             | Prod     | 32-byte hex key for AES-256-GCM token encryption           |
| `LLM_PROVIDER`               | No       | `openai` (default) or `openrouter`                         |
| `LLM_MODEL`                  | No       | Model ID override (e.g., `google/gemini-2.5-flash`)        |
| `FRONTEND_URL`               | No       | Frontend origin for CORS and redirects                     |

Optional provider OAuth credentials for GitLab, Bitbucket, and Azure DevOps are documented in `.env.example`.

## Development

### Scripts

```bash
npm run build             # Build all packages and services
npm run build:shared      # Build shared package only
npm run type-check        # TypeScript type checking (all packages)
npm run lint              # ESLint
npm run lint:fix          # ESLint with auto-fix
npm run format            # Prettier formatting
npm run test              # Run all tests (Jest)
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run check:duplication # Check for code duplication
npm run validate          # Validate environment variables
```

### Docker Commands

```bash
docker compose up -d                  # Start all services
docker compose down                   # Stop all services
docker compose logs -f github-app     # Tail logs for a service
docker compose restart api            # Restart a single service
docker compose up -d --build          # Rebuild and start
docker compose ps                     # Check service status
```

### Docker Services

| Service           | Port | Description                     |
| ----------------- | ---- | ------------------------------- |
| `api`             | 3000 | API service                     |
| `slack-bot`       | 3001 | Slack bot                       |
| `github-app`      | 3002 | GitHub App                      |
| `frontend`        | 3003 | Web dashboard (nginx)           |
| `incident-triage` | 3004 | Incident triage                 |
| `postgres`        | 5433 | PostgreSQL 16 with pgvector     |
| `redis`           | --   | Redis 7 (internal network only) |
| `prometheus`      | 9090 | Metrics collection              |
| `grafana`         | 3005 | Monitoring dashboards           |
| `alertmanager`    | 9093 | Alert routing                   |

### Code Quality

The project enforces strict architectural patterns. Key conventions:

- Services use factory functions with closures (not classes)
- Services depend on port interfaces, never on adapters directly
- Repositories return domain objects, never raw database rows
- All external calls require timeouts, structured logs, and error classification
- Typed errors only (`ValidationError`, `NotFoundError`, etc.) -- no bare `throw new Error()`
- `RequestContext` propagates through all layers (handler, service, adapter)
- Webhook signatures are verified before any processing

See [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) for the complete coding standards.

## How It Works

### CI Failure Analysis Flow

1. GitHub sends a `check_run` webhook when CI fails
2. The GitHub App gathers context: logs, annotations, PR diff, commit history (in parallel)
3. Failures are aggregated with a debounce window to consolidate related failures
4. The analysis pipeline chunks large logs, extracts key signals per chunk, then runs a final LLM analysis
5. Deterministic confidence scoring validates the AI output
6. Results are posted to the PR as a GitHub comment and sent as a Slack notification
7. Users can approve or reject suggested actions via interactive Slack buttons

### Incident Triage Flow

1. Monitoring tools (PagerDuty, Datadog, etc.) send alert webhooks to the triage service
2. Alerts are normalized, deduplicated, and correlated with existing incidents
3. Severity is classified, evidence is aggregated, and runbooks are matched
4. An AI summarizer generates a triage report with recommended next steps
5. Results are dispatched to Slack channels or PagerDuty for response coordination

### Safety Architecture

The LLM is treated as an untrusted helper. It provides analysis and suggestions but never executes actions directly.

| Confidence  | Behavior                                 |
| ----------- | ---------------------------------------- |
| 0.85+       | Auto-approve safe, low-impact actions    |
| 0.70 - 0.85 | Require human approval for risky actions |
| 0.50 - 0.70 | Require approval for all actions         |
| Below 0.50  | Block all actions, require manual review |

All actions are validated by deterministic safety checks. Dangerous operations (data deletion, force pushes) are always blocked regardless of confidence.

## Documentation

- [QUICKSTART.md](./QUICKSTART.md) -- Step-by-step setup guide
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) -- System architecture
- [docs/SYSTEM_ARCHITECTURE.md](./docs/SYSTEM_ARCHITECTURE.md) -- Detailed component design
- [docs/DATA_MODELS.md](./docs/DATA_MODELS.md) -- Data schemas (Event, Evidence, Analysis)
- [DOCKER.md](./DOCKER.md) -- Docker deployment guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) -- Contribution guidelines
- [.claude/CLAUDE.md](./.claude/CLAUDE.md) -- Coding standards and conventions

## License

MIT
