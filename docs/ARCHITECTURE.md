# Kenchi Architecture Documentation

## Overview

Kenchi is an AI-driven DevOps assistant built as a TypeScript monorepo. It integrates with Slack and GitHub to provide intelligent CI failure analysis and real-time notifications.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Kenchi System                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   External   │    │   External   │    │   External   │     │
│  │   Sources    │    │   Sources    │    │   Sources    │     │
│  │              │    │              │    │              │     │
│  │ • CI/CD      │    │ • GitHub     │    │ • Slack      │     │
│  │ • Webhooks   │    │ • PR Events  │    │ • Commands   │     │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘     │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                   │
│         ┌───────────────────┼───────────────────┐              │
│         │                   │                   │              │
│  ┌──────▼──────┐    ┌───────▼──────┐   ┌───────▼──────┐       │
│  │ API Service │    │ Slack Bot    │   │ GitHub App   │       │
│  │ (Port 3000) │    │ (Port 3001)  │   │ (Port 3002)  │       │
│  └──────┬──────┘    └───────┬──────┘   └───────┬──────┘       │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                   │
│                    ┌────────▼────────┐                         │
│                    │  Shared Package │                         │
│                    │  (@kenchi/shared)│                         │
│                    │                  │                         │
│                    │ • Config         │                         │
│                    │ • OpenAI Client  │                         │
│                    │ • Vector Store   │                         │
│                    │ • Safety Utils   │                         │
│                    │ • Logger         │                         │
│                    │ • Error Handling │                         │
│                    └──────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Component Overview

### 1. Services Layer

#### API Service (`/services/api`)

- **Purpose**: Central AI analysis service with OpenAI integration
- **Port**: 3000
- **Key Endpoints**:
  - `POST /webhook/:source` - Generic webhook receiver
  - `POST /events` - Event ingestion with validation
  - `POST /api/analyze` - CI failure analysis with OpenAI
  - `GET /health` - Health check
- **Features**:
  - Rate limiting (100 req/min per IP)
  - Request validation
  - Structured logging
  - Error handling middleware

#### Slack Bot Service (`/services/slack-bot`)

- **Purpose**: Slack integration and bot interactions
- **Port**: 3001
- **Key Features**:
  - `/kenchi` slash command handler
  - Message event handling
  - App mention handling
  - `POST /slack/message` - Endpoint for posting CI failure notifications
- **Technology**: Slack Bolt Framework (Socket Mode)
- **Multi-tenant Support**: Uses `installation_id` to lookup tenant credentials

#### GitHub App Service (`/services/github-app`)

- **Purpose**: GitHub webhook handling and CI failure processing
- **Port**: 3002
- **Key Features**:
  - Pull request webhook handler
  - CI check run webhook handler (processes failures)
  - GitHub API integration (Octokit)
  - Enriched context gathering for CI failures
- **Technology**: Express + Octokit

### 2. Shared Package (`/packages/shared`)

Common utilities and types used across all services:

#### Configuration (`config.ts`)

- Centralized environment variable management
- Uses `dotenv` for loading `.env` file
- TypeScript interface for type safety
- Validates required environment variables

#### OpenAI Client (`openaiClient.ts`)

- Full OpenAI API integration
- `analyzeIncident(event, evidence): Promise<LLMAnalysisResult>`
- Structured output with confidence scoring
- Retry logic with exponential backoff

#### Vector Store (`vectorStore.ts`)

- Interface for vector database operations
- `upsertDocumentEmbedding(id, content)`
- `querySimilar(text): string[]`
- PostgreSQL + pgvector integration

#### Safety Helpers (`safety.ts`)

- `confidenceScore(result): number` - Confidence scoring
- `shouldActOnResult(result, threshold): boolean` - Validation helper
- Ensures LLM outputs are validated before action

#### Logger (`logger.ts`)

- Structured JSON logging
- Log levels: DEBUG, INFO, WARN, ERROR
- Service-specific loggers
- Timestamp and metadata support

#### Error Handling (`errors.ts`)

- Custom error classes:
  - `AppError` - Base error class
  - `ValidationError` - Input validation errors
  - `AuthenticationError` - Auth failures
  - `NotFoundError` - Resource not found
  - `ExternalServiceError` - External API failures
  - `LLMError` - LLM-related errors

#### Middleware (`middleware.ts`)

- `errorHandler` - Centralized error handling
- `asyncHandler` - Wrapper for async route handlers
- `requestLogger` - HTTP request logging

#### Validation (`validation.ts`)

- Request validation middleware
- Common validators (required, string, number, email, etc.)
- Schema-based validation

#### Rate Limiting (`rateLimit.ts`)

- In-memory rate limiter
- Configurable window and max requests
- IP-based limiting

#### Types (`types.ts`)

- Common TypeScript interfaces:
  - `LLMAnalysisResult`
  - `WebhookEvent`
  - `CIFailureEvent`
  - `SlackMessageEvent`
  - `GitHubPREvent`

## Docker Architecture

### Docker Compose Setup

All services run in a unified Docker Compose environment:

```yaml
services:
  api: # Port 3000
  slack-bot: # Port 3001
  github-app: # Port 3002
  postgres: # Port 5433
```

### Network Architecture

```
┌─────────────────────────────────────────┐
│      Docker Network: kenchi_default      │
│                                          │
│  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │   api    │  │slack-bot │  │github- │ │
│  │ :3000    │  │ :3001    │  │ app    │ │
│  │          │  │          │  │ :3002  │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘ │
│       │             │             │       │
│       └─────────────┼─────────────┘       │
│                     │                     │
│              ┌──────▼──────┐              │
│              │  PostgreSQL │              │
│              │   :5432     │              │
│              └─────────────┘              │
│                                          │
└──────────────────────────────────────────┘
```

### Service Communication

Services communicate using **Docker service names** within the `kenchi_default` network:

- `http://api:3000` - API service
- `http://slack-bot:3001` - Slack bot service
- `http://github-app:3002` - GitHub app service

**Benefits**:

- No IP address management
- Automatic DNS resolution
- Works across container restarts
- Standard Docker networking

## Data Flow

### CI Failure Analysis Flow

```
1. GitHub CI Failure
   │
   │ POST /webhook/github (check_run event)
   │ { action: "completed", conclusion: "failure" }
   ▼
2. GitHub App Service (port 3002)
   │
   │ • Receives webhook
   │ • Gathers enriched context (annotations, logs, PR info)
   │ • Builds comprehensive failure log
   │
   ▼
3. API Service (port 3000)
   │ POST http://api:3000/api/analyze
   │ { failure_log, repository }
   │
   │ API Service:
   │ • Calls OpenAI for analysis
   │ • Returns structured analysis with confidence
   │
   ▼
4. Slack Bot Service (port 3001)
   │ POST http://slack-bot:3001/slack/message
   │ { analysis, installation_id }
   │
   │ Slack Bot Service:
   │ • Looks up tenant by installation_id
   │ • Formats rich Block Kit message
   │ • Posts to appropriate Slack channel
   │
   ▼
5. Slack Workspace
   │ User sees formatted CI failure notification
```

### Slack Command Flow

```
1. User in Slack
   │
   │ /kenchi analyze this error
   │
   ▼
2. Slack Bot Service
   │
   │ • Receives slash command
   │ • Logs command
   │ • Calls OpenAI for analysis
   │ • Returns response to Slack
   │
   ▼
3. User sees response in Slack
```

### GitHub PR Flow

```
1. GitHub Webhook
   │
   │ POST /webhook/pull_request
   │ { action, pull_request, repository }
   │
   ▼
2. GitHub App Service
   │
   │ • Receives webhook
   │ • Logs event
   │ • Analyzes PR
   │ • Posts comment
   │
   ▼
3. GitHub PR updated
```

## Technology Stack

### Runtime & Language

- **Node.js** 20+
- **TypeScript** 5.3+
- **ES Modules** (ESM)

### Frameworks & Libraries

- **Express.js** - Web framework for all services
- **Slack Bolt** - Slack bot framework (Socket Mode)
- **Octokit** - GitHub API client
- **OpenAI SDK** - AI analysis

### Development Tools

- **Jest** - Testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **tsx** - TypeScript execution (dev mode)

### Infrastructure

- **Docker** - Containerization
- **Docker Compose** - Service orchestration
- **npm workspaces** - Monorepo management
- **PostgreSQL** - Database with pgvector

### Shared Dependencies

- **dotenv** - Environment variable management

## Safety Architecture

### LLM Safety Boundaries

```
┌─────────────────────────────────────────┐
│         LLM (OpenAI) Layer              │
│                                         │
│  • Provides analysis                    │
│  • Returns suggestions                  │
│  • NEVER executes actions               │
│                                         │
└──────────────┬──────────────────────────┘
               │
               │ Analysis/Suggestions
               ▼
┌─────────────────────────────────────────┐
│      Deterministic Validation Layer     │
│                                         │
│  • confidenceScore()                   │
│  • shouldActOnResult()                 │
│  • Input validation                    │
│  • Output sanitization                 │
│                                         │
└──────────────┬──────────────────────────┘
               │
               │ Validated & Approved
               ▼
┌─────────────────────────────────────────┐
│      Action Execution Layer              │
│                                         │
│  • Deterministic code only              │
│  • No direct LLM execution              │
│  • All side-effects controlled          │
│                                         │
└─────────────────────────────────────────┘
```

### Safety Principles

1. **LLM as Untrusted Helper**
   - LLM outputs are never executed directly
   - All outputs are analyzed and validated
   - Confidence scoring before any action

2. **Deterministic Execution**
   - All actions executed by deterministic code
   - No code generation or execution from LLM
   - Explicit validation gates

3. **Confidence Thresholds**
   - Actions only taken if confidence > threshold (default: 0.8)
   - Low confidence triggers human review
   - All actions logged for audit

## Monorepo Structure

```
kenchi/
├── services/              # Individual services
│   ├── api/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── slack-bot/
│   └── github-app/
├── packages/              # Shared code
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── scripts/               # Utility scripts
├── docs/                  # Documentation
├── docker-compose.yml     # Docker orchestration
├── Dockerfile             # Multi-stage build
├── package.json           # Root workspace config
└── tsconfig.json          # Root TypeScript config
```

## Build System

### TypeScript Project References

- Root `tsconfig.json` defines base configuration
- Each package/service has its own `tsconfig.json`
- Project references enable incremental builds
- Composite builds for faster compilation

### Build Order

1. Shared package (`packages/shared`) - Built first
2. Services (`services/*`) - Built after shared
3. All services depend on `@kenchi/shared`

### Docker Build

Multi-stage Dockerfile:

- **Builder stage**: Installs dependencies, builds TypeScript
- **Production stage**: Copies built files, installs production deps only

## Environment Configuration

### Environment Variables

All services use the same `.env` file:

- Centralized configuration
- Shared across all services
- Validated on startup

### Required Variables

- `OPENAI_API_KEY` - OpenAI API key
- `SLACK_BOT_TOKEN` - Slack bot token
- `SLACK_SIGNING_SECRET` - Slack app signing secret
- `GITHUB_APP_ID` - GitHub App ID
- `GITHUB_APP_PRIVATE_KEY` - GitHub App private key
- `DATABASE_URL` - Database connection
- `NODE_ENV` - Environment (development/production)
- `PORT` - Service port (defaults per service)

## Deployment Architecture

### Development

```bash
# Local development (no Docker)
npm run dev:api
npm run dev:slack-bot
npm run dev:github-app
```

### Production

```bash
# All services in Docker Compose
docker compose up -d

# Services communicate via Docker network
# External access via exposed ports
```

### Port Mapping

- `3000:3000` - API Service
- `3001:3001` - Slack Bot Service
- `3002:3002` - GitHub App Service
- `5433:5432` - PostgreSQL

## Real-Time Architecture

### How Real-Time Works

1. **GitHub Webhooks** - Push-based, instant notifications when CI fails
2. **Services Always Running** - All Docker services run 24/7
3. **Slack Socket Mode** - Persistent WebSocket connection for Slack

### Response Time

- GitHub webhook → Slack notification: **3-8 seconds**
- Most time spent on OpenAI analysis
- No polling, all push-based

## Security Considerations

### Current Implementation

- Environment variables for secrets
- Rate limiting on API endpoints
- Request validation middleware
- Error handling (no sensitive data leakage)

### Future Enhancements

- [ ] API key authentication
- [ ] Webhook signature verification
- [ ] HTTPS/TLS in production
- [ ] Secrets management (Vault, AWS Secrets Manager)
- [ ] Network policies and firewalls

## Scalability Considerations

### Current Architecture

- Stateless services (can scale horizontally)
- In-memory rate limiting (per-instance)
- No shared state between instances

### Future Enhancements

- [ ] Distributed rate limiting (Redis)
- [ ] Message queue for async processing
- [ ] Load balancing configuration
- [ ] Horizontal scaling support

## Monitoring & Observability

### Current Implementation

- Structured JSON logging
- Health check endpoints
- Request logging middleware

### Future Enhancements

- [ ] Metrics collection (Prometheus)
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Log aggregation (ELK stack)
- [ ] Alerting and notifications
- [ ] Performance monitoring

## Development Workflow

### Local Development

1. Install dependencies: `npm install`
2. Build shared package: `npm run build:shared`
3. Start services: `npm run dev:*`
4. Make changes (hot reload enabled)
5. Run tests: `npm test`

### Docker Development

1. Configure `.env` file
2. Start all services: `docker compose up -d`
3. View logs: `docker compose logs -f`
4. Make code changes
5. Rebuild: `docker compose up -d --build`

## Testing Strategy

### Unit Tests

- Service-specific tests
- Shared package tests

### Integration Tests

- Service-to-service communication
- End-to-end flow tests

### Test Commands

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
```

## Future Architecture Considerations

### Planned Enhancements

1. **Database Integration**
   - PostgreSQL for relational data
   - pgvector for vector embeddings
   - Migration system

2. **Message Queue**
   - RabbitMQ or Redis for async processing
   - Event-driven architecture

3. **API Gateway**
   - Centralized routing
   - Authentication/authorization
   - Rate limiting

4. **Caching Layer**
   - Redis for caching
   - Response caching
   - Session management

5. **Monitoring Stack**
   - Prometheus + Grafana
   - Distributed tracing
   - Log aggregation

## Conclusion

Kenchi is designed as a modular, scalable, and safe AI-driven DevOps assistant. The architecture emphasizes:

- **Separation of Concerns**: Each service has a clear responsibility
- **Safety First**: LLM outputs are never executed directly
- **Docker-First**: Consistent environment across development and production
- **Real-Time**: Push-based webhooks for instant notifications
- **Type Safety**: TypeScript throughout for reliability
- **Observability**: Structured logging and health checks

The system is production-ready for CI failure analysis and designed to scale as features are added.
