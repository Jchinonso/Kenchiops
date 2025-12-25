# Kenchi - AI-Driven DevOps Assistant

[![CI](https://github.com/kenchiops/Kenchiops/actions/workflows/ci.yml/badge.svg)](https://github.com/kenchiops/Kenchiops/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-90%25-brightgreen)](./packages/shared/src/__tests__)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3+-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

A TypeScript monorepo for an AI-driven DevOps assistant that integrates with Slack and GitHub for real-time CI failure analysis.

> **Quick Start**: See [QUICKSTART.md](./QUICKSTART.md) for a step-by-step setup guide.  
> **Architecture**: See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for detailed system architecture and design.  
> **Code Organization**: See [docs/CODE_ORGANIZATION.md](./docs/CODE_ORGANIZATION.md) for duplication prevention and code organization guidelines.

## 🏗️ Project Structure

```
kenchi/
├── services/
│   ├── api/              # Express API service for AI analysis
│   ├── slack-bot/        # Slack bot service using Bolt framework
│   └── github-app/       # GitHub App service for PR comments and CI status
├── packages/
│   └── shared/           # Shared library (config, OpenAI client, vector store, utils)
└── .env.example          # Environment variable template
```

## 🚀 Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 20+ and npm (for local development)
- TypeScript 5.3+ (installed as dev dependency)
- Slack App credentials (Bot Token, Signing Secret, App Token)
- GitHub App credentials (App ID, Private Key, Webhook Secret)
- OpenAI API key

### Quick Start with Docker (Recommended)

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd kenchi
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Fill in your environment variables in `.env`:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `SLACK_BOT_TOKEN` - Slack bot token
   - `SLACK_SIGNING_SECRET` - Slack app signing secret
   - `GITHUB_APP_ID` - GitHub App ID
   - `GITHUB_APP_PRIVATE_KEY` - GitHub App private key
   - `DATABASE_URL` - Database connection string (if using)
   - `VECTOR_DB_URL` - Vector database connection (if using)

4. Start all services with Docker Compose:

   ```bash
   docker compose up -d
   ```

5. Access services:
   - API Service: http://localhost:3000
   - Slack Bot Service: http://localhost:3001
   - GitHub App Service: http://localhost:3002

### Local Development (Without Docker)

For local development with hot reload:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the shared package:

   ```bash
   npm run build:shared
   ```

3. Copy and configure `.env` file (see above)

4. Start services in development mode:
   ```bash
   npm run dev:api
   npm run dev:slack-bot
   npm run dev:github-app
   ```

## 🛠️ Development Scripts

- `npm run build` - Build all packages (shared first, then services)
- `npm run build:shared` - Build only the shared package
- `npm run build:api` - Build API service (builds shared first)
- `npm run build:slack-bot` - Build Slack bot service (builds shared first)
- `npm run build:github-app` - Build GitHub App service (builds shared first)
- `npm run dev:api` - Start API service in development mode with hot reload
- `npm run dev:slack-bot` - Start Slack bot service in development mode
- `npm run dev:github-app` - Start GitHub App service in development mode
- `npm run validate` - Validate environment variables are set correctly
- `npm run check-build` - Check that all required packages are built
- `npm run type-check` - Run TypeScript type checking across all packages
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Automatically fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run clean` - Remove all build artifacts

## 📦 Services

### API Service (`/services/api`)

Handles incoming webhooks and events from various sources. Provides endpoints for event ingestion and webhook routing.

**Port**: 3000 (default)

### Slack Bot Service (`/services/slack-bot`)

Slack bot using the Bolt framework. Handles slash commands (`/kenchi`), message events, and app mentions.

**Port**: 3001 (default)

### GitHub App Service (`/services/github-app`)

GitHub App service that handles webhook events for pull requests, CI checks, and other repository events.

**Port**: 3002 (default)

## 📚 Shared Package (`/packages/shared`)

Contains shared utilities used across all services:

- **Config**: Centralized environment variable management with validation
- **OpenAI Client**: OpenAI API integration with retry logic and token management
- **Vector Store**: Interface for vector database operations
- **Safety Helpers**: Confidence scoring, evidence validation, and action gating
- **Logger**: Structured logging utility with JSON output
- **Error Handling**: Typed error classes (ValidationError, NotFoundError, LLMError, etc.)
- **Security**: Secret redaction and input sanitization utilities
- **Rate Limiting**: In-memory rate limiting middleware
- **Types**: Common TypeScript interfaces and types
- **Array Utils**: Functional utilities for deduplication, grouping, and filtering

## 🛡️ Safety & Security

### Critical Safety Principle

**The LLM (OpenAI) is treated as an untrusted helper.**

- ✅ LLM outputs are **analyzed and validated** by deterministic code
- ✅ LLM provides **suggestions only** - never executes commands directly
- ✅ All side-effects (commands, state changes) are handled by **deterministic code**
- ✅ Confidence scoring is used to validate LLM suggestions before action
- ❌ **NEVER** execute LLM outputs as code or commands directly

This separation ensures that the AI assistant is safe and predictable, with all critical decisions made by trusted, deterministic application logic.

## 🐳 Docker

All services run in Docker Compose for easy setup and consistent environments.

### Docker Compose Services

The `docker-compose.yml` includes:

- **API Service** - Port 3000
- **Slack Bot Service** - Port 3001
- **GitHub App Service** - Port 3002
- **PostgreSQL** - Port 5433 (database)

### Docker Commands

**Start all services:**

```bash
docker compose up -d
```

**Stop all services:**

```bash
docker compose down
```

**View logs:**

```bash
docker compose logs -f
docker compose logs -f api        # Specific service
docker compose logs -f slack-bot
docker compose logs -f github-app
```

**Restart a service:**

```bash
docker compose restart api
```

**Rebuild and restart:**

```bash
docker compose up -d --build
```

**Check service status:**

```bash
docker compose ps
```

### Service Communication

All services run in the same Docker network (`kenchi_default`). Services communicate using Docker service names:

- `http://api:3000` - API service
- `http://slack-bot:3001` - Slack bot service
- `http://github-app:3002` - GitHub app service

Services communicate using these Docker service names internally.

### Local Development vs Docker

- **Docker Compose**: Use for production, testing workflows, or when you want everything running together
- **Local Development**: Use `npm run dev:*` for faster iteration with hot reload

See [DOCKER.md](./DOCKER.md) for detailed guidance.

## 🎯 Code Quality Standards

This codebase follows strict functional programming patterns:

- **No imperative loops**: All `for`, `forEach`, `while` replaced with `map`, `filter`, `reduce`, `flatMap`
- **Lookup tables**: Switch statements replaced with handler lookup patterns
- **Typed errors**: All errors use typed classes from `@kenchi/shared`
- **Immutability**: Minimal `let` declarations, preferring `const` and functional patterns
- **Data-driven config**: Configuration arrays with condition/handler patterns

### Code Quality Metrics

| Metric              | Count |
| ------------------- | ----- |
| `throw new Error`   | 0     |
| `for` loops         | 0     |
| `forEach`           | 0     |
| `switch` statements | 0     |
| `any` type (source) | 0     |
| Tests passing       | 134   |

## 📝 TODO

### Immediate Next Steps

- [x] Implement OpenAI API calls in `OpenAIClient`
- [x] Implement confidence scoring logic
- [x] Flesh out Slack command handling
- [x] Implement GitHub webhook handling
- [ ] Replace vector store with real database integration (Postgres + pgvector)
- [ ] Add authentication/authorization to API endpoints
- [ ] Set up database schema and migrations

### Future Enhancements

- [x] Implement comprehensive error handling and retry logic
- [x] Add logging and monitoring utilities
- [x] Create Docker containers for each service
- [x] Add unit and integration tests
- [x] Set up CI/CD pipelines (GitHub Actions)
- [x] Add rate limiting middleware
- [x] Add request validation middleware
- [x] Add secret redaction utilities
- [x] Implement functional programming patterns
- [ ] Add database migrations
- [ ] Add integration tests
- [ ] Set up monitoring and alerting

## 📄 License

MIT

## 🤝 Contributing

This is a scaffolded project. See individual service READMEs for specific implementation details and TODOs.
