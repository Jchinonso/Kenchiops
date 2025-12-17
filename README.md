# Kenchi - AI-Driven DevOps Assistant

A TypeScript monorepo for an AI-driven DevOps assistant that integrates with Slack, GitHub, and n8n workflows.

> **Quick Start**: See [QUICKSTART.md](./QUICKSTART.md) for a step-by-step setup guide.

## 🏗️ Project Structure

```
kenchi/
├── services/
│   ├── api/              # Express API service for incoming webhooks/events
│   ├── slack-bot/        # Slack bot service using Bolt framework
│   └── github-app/       # GitHub App service for PR comments and CI status
├── packages/
│   └── shared/           # Shared library (config, OpenAI client, vector store, utils)
├── n8n/
│   └── workflows/        # n8n workflow definitions for automation
└── .env.example          # Environment variable template
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- TypeScript 5.3+ (installed as dev dependency)
- n8n instance (for workflows)
- Slack App credentials
- GitHub App credentials
- OpenAI API key

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Build the shared package (required for other services):
   ```bash
   npm run build:shared
   ```

3. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

4. Fill in your environment variables in `.env`:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `SLACK_BOT_TOKEN` - Slack bot token
   - `SLACK_SIGNING_SECRET` - Slack app signing secret
   - `GITHUB_APP_ID` - GitHub App ID
   - `GITHUB_APP_PRIVATE_KEY` - GitHub App private key
   - `DATABASE_URL` - Database connection string (if using)
   - `VECTOR_DB_URL` - Vector database connection (if using)

5. Validate environment variables:
   ```bash
   npm run validate
   ```

6. Build all services:
   ```bash
   npm run build
   ```

   Or build individually:
   ```bash
   npm run build:shared  # Must be built first
   npm run build:api
   npm run build:slack-bot
   npm run build:github-app
   ```

7. Verify builds:
   ```bash
   npm run check-build
   ```

8. Start services individually:
   ```bash
   # API service
   cd services/api && npm start

   # Slack bot service
   cd services/slack-bot && npm start

   # GitHub App service
   cd services/github-app && npm start
   ```

   Or use development mode with hot reload:
   ```bash
   # From root directory
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
- **Config**: Centralized environment variable management
- **OpenAI Client**: Stub for OpenAI API integration
- **Vector Store**: Interface and placeholder for vector database operations
- **Safety Helpers**: Confidence scoring and validation utilities
- **Logger**: Structured logging utility with JSON output
- **Error Handling**: Custom error classes and Express middleware
- **Types**: Common TypeScript interfaces and types

## 🔄 n8n Workflows (`/n8n/workflows`)

Contains workflow definitions for automation. Example workflow: CI failure analysis that triggers OpenAI analysis and posts to Slack.

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

> **When to use Docker**: See [DOCKER.md](./DOCKER.md) for detailed guidance on when to use Docker vs local development.

Docker is used for:
- **Production deployments** - Containerized services for production
- **n8n workflows** - n8n runs in Docker (see `../n8n/docker-compose.yml`)
- **CI/CD pipelines** - Automated builds and deployments

For **local development**, use `npm run dev:*` instead (faster, hot reload).

### Build and Run with Docker

Build all services:
```bash
docker-compose build
```

Run all services:
```bash
docker-compose up
```

Run a specific service:
```bash
docker-compose up api
docker-compose up slack-bot
docker-compose up github-app
```

### Build Individual Service Image

```bash
# Build for API service
docker build -t kenchi-api --build-arg SERVICE=api .

# Run the container
docker run -p 3000:3000 --env-file .env kenchi-api
```

### n8n Docker Setup

n8n (workflow automation) runs separately in Docker:

```bash
# Start n8n
docker-compose -f ../n8n/docker-compose.yml up

# Access n8n UI
# http://localhost:5678 (admin/admin123)
```

## 📝 TODO

### Immediate Next Steps
- [ ] Implement actual OpenAI API calls in `OpenAIClient`
- [ ] Replace dummy vector store with real database integration (Postgres + pgvector or Chroma)
- [ ] Implement real confidence scoring logic
- [ ] Flesh out Slack command handling with OpenAI integration
- [ ] Implement GitHub PR analysis and comment posting
- [ ] Add authentication/authorization to API endpoints
- [ ] Set up database schema and migrations

### Future Enhancements
- [x] Implement comprehensive error handling and retry logic
- [x] Add logging and monitoring utilities
- [x] Create Docker containers for each service
- [x] Add unit and integration tests
- [x] Set up CI/CD pipelines (GitHub Actions)
- [x] Add API documentation (OpenAPI/Swagger) - placeholder
- [x] Add rate limiting middleware
- [x] Add request validation middleware
- [ ] Implement actual OpenAI API integration
- [ ] Add database migrations
- [ ] Add integration tests
- [ ] Set up monitoring and alerting

## 📄 License

MIT

## 🤝 Contributing

This is a scaffolded project. See individual service READMEs for specific implementation details and TODOs.

