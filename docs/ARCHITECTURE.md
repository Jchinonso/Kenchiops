# Kenchi Architecture Documentation

## Overview

Kenchi is an AI-driven DevOps assistant built as a TypeScript monorepo. It integrates with Slack, GitHub, and n8n workflows to provide intelligent automation and analysis capabilities for DevOps tasks.

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
│                    ┌────────▼────────┐                         │
│                    │   n8n Workflow  │                         │
│                    │   Automation    │                         │
│                    │   (Port 5678)   │                         │
│                    └────────┬────────┘                         │
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

- **Purpose**: Central webhook and event ingestion point
- **Port**: 3000
- **Key Endpoints**:
  - `POST /webhook/:source` - Generic webhook receiver
  - `POST /events` - Event ingestion with validation
  - `POST /api/analyze` - CI failure analysis (for n8n workflows)
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
  - `POST /slack/message` - Endpoint for n8n workflows to post messages
- **Technology**: Slack Bolt Framework
- **Dual Server Setup**:
  - Port 3001: Express server for n8n integration endpoints
  - Port 3002: Slack Bolt webhook server for Slack events

#### GitHub App Service (`/services/github-app`)

- **Purpose**: GitHub webhook handling and PR interactions
- **Port**: 3002
- **Key Features**:
  - Pull request webhook handler
  - CI check run webhook handler
  - GitHub API integration (Octokit)
  - Placeholder for comment posting
- **Technology**: Express + Octokit

### 2. Shared Package (`/packages/shared`)

Common utilities and types used across all services:

#### Configuration (`config.ts`)

- Centralized environment variable management
- Uses `dotenv` for loading `.env` file
- TypeScript interface for type safety
- Validates required environment variables

#### OpenAI Client (`openaiClient.ts`)

- Stub for OpenAI API integration
- `generateAnalysis(prompt: string): Promise<string>`
- Currently returns placeholder responses
- TODO: Implement actual OpenAI API calls

#### Vector Store (`vectorStore.ts`)

- Interface for vector database operations
- `upsertDocumentEmbedding(id, content)`
- `querySimilar(text): string[]`
- `InMemoryVectorStore` placeholder implementation
- TODO: Integrate with Postgres + pgvector or Chroma

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

### 3. n8n Workflows (`/n8n/workflows`)

Workflow automation definitions:

#### CI Failure Analysis Workflow (`ci-failure-analysis.json`)

- **Trigger**: Webhook at `/webhook-test/ci-failure`
- **Flow**:
  1. Webhook receives CI failure event
  2. HTTP Request → `http://api:3000/api/analyze`
  3. HTTP Request → `http://slack-bot:3001/slack/message`
  4. Respond to Webhook → Success response

## Docker Architecture

### Docker Compose Setup

All services run in a unified Docker Compose environment:

```yaml
services:
  api: # Port 3000
  slack-bot: # Port 3001
  github-app: # Port 3002
  n8n: # Port 5678
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
│              │     n8n     │              │
│              │   :5678     │              │
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

### CI Failure Analysis Workflow

```
1. CI System
   │
   │ POST /webhook-test/ci-failure
   │ { log, repository, branch, commit }
   ▼
2. n8n Webhook Node
   │
   │ Receives event
   │
   ▼
3. HTTP Request Node → API Service
   │ POST http://api:3000/api/analyze
   │ { failure_log, repository }
   │
   │ API Service:
   │ • Logs request
   │ • Calls OpenAI client (placeholder)
   │ • Returns analysis
   │
   ▼
4. HTTP Request Node → Slack Bot Service
   │ POST http://slack-bot:3001/slack/message
   │ { channel, message: analysis }
   │
   │ Slack Bot Service:
   │ • Logs message request
   │ • Posts to Slack (placeholder)
   │ • Returns confirmation
   │
   ▼
5. Respond to Webhook Node
   │ Returns: { status: "processed" }
   │
   ▼
6. CI System receives response
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
   │ • Calls OpenAI client (placeholder)
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
   │ • Analyzes PR (placeholder)
   │ • Posts comment (placeholder)
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
- **Slack Bolt** - Slack bot framework
- **Octokit** - GitHub API client
- **n8n** - Workflow automation platform

### Development Tools

- **Jest** - Testing framework
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **tsx** - TypeScript execution (dev mode)

### Infrastructure

- **Docker** - Containerization
- **Docker Compose** - Service orchestration
- **npm workspaces** - Monorepo management

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
├── n8n/
│   └── workflows/         # n8n workflow definitions
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
- `DATABASE_URL` - Database connection (optional)
- `VECTOR_DB_URL` - Vector database connection (optional)
- `NODE_ENV` - Environment (development/production)
- `PORT` - Service port (defaults per service)

## Deployment Architecture

### Development

```bash
# Local development (no Docker)
npm run dev:api
npm run dev:slack-bot
npm run dev:github-app

# n8n still runs in Docker
docker compose up n8n
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
- `5678:5678` - n8n

## Workflow Integration

### n8n as Orchestration Layer

n8n serves as the workflow orchestration layer:

1. **Receives Events**: Webhooks from external systems
2. **Orchestrates Flow**: Routes events through services
3. **Coordinates Actions**: Calls multiple services in sequence
4. **Handles Responses**: Aggregates and returns results

### Workflow Patterns

#### Pattern 1: Event-Driven Analysis

```
External Event → n8n → API Service → Slack Notification
```

#### Pattern 2: Command Processing

```
Slack Command → Slack Bot → OpenAI → Response to Slack
```

#### Pattern 3: GitHub Integration

```
GitHub Webhook → GitHub App → Analysis → Comment on PR
```

## Security Considerations

### Current Implementation

- Environment variables for secrets
- Rate limiting on API endpoints
- Request validation middleware
- Error handling (no sensitive data leakage)

### Future Enhancements

- [ ] API key authentication for n8n → services
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
- [ ] Database for state persistence
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
- Workflow structure validation

### Integration Tests

- Service-to-service communication
- n8n workflow execution
- End-to-end workflow tests

### Test Commands

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # Coverage report
npm run test:workflow-e2e  # End-to-end workflow test
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
- **Workflow-Driven**: n8n orchestrates complex automation flows
- **Type Safety**: TypeScript throughout for reliability
- **Observability**: Structured logging and health checks

The system is production-ready for basic workflows and designed to scale as features are added.
