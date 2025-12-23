# Docker Usage Guide

This document explains when and where Docker is used in the Kenchi project.

## When to Use Docker

Docker is used in **two different contexts** in this project:

### 1. **Production Deployment** (Kenchi Services)

Use Docker for:

- ✅ **Production deployments** - Running services in production environments
- ✅ **Consistent environments** - Ensuring all services run in the same environment
- ✅ **Container orchestration** - Managing multiple services together
- ✅ **CI/CD pipelines** - Automated builds and deployments
- ✅ **Isolation** - Running services in isolated containers

**When NOT to use Docker:**

- ❌ **Local development** - Use `npm run dev:*` for faster iteration
- ❌ **Testing** - Use local services for unit/integration tests
- ❌ **Quick prototyping** - Direct npm commands are faster

### 2. **Database (PostgreSQL with pgvector)**

Use Docker for:

- ✅ **Running PostgreSQL** - PostgreSQL runs in Docker Compose
- ✅ **Vector embeddings** - pgvector extension for similarity search
- ✅ **Multi-tenant support** - Tenant data storage

## Docker Usage Scenarios

### Scenario 1: Local Development

**Don't use Docker for services** - Use npm directly:

```bash
# Development mode (recommended)
npm run dev:api          # Hot reload, faster iteration
npm run dev:slack-bot
npm run dev:github-app
```

**Why?** Faster startup, hot reload, easier debugging, direct access to logs.

### Scenario 2: Testing

**Don't use Docker** - Use local services:

```bash
# Run tests
npm test

# Services run locally for testing
npm run dev:api &
npm run dev:slack-bot &
```

**Why?** Faster test execution, easier to mock, no container overhead.

### Scenario 3: Production Deployment

**Use Docker** - Containerized services:

```bash
# Build and run all services
docker-compose build
docker-compose up -d

# Or deploy to Kubernetes/Docker Swarm
```

**Why?** Consistent environment, isolation, scalability, production-ready.

### Scenario 4: Full Stack Testing

**Use Docker** - All services run together:

```bash
# Start all services
docker compose up -d

# Test the complete CI failure flow
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

**Why?** All services run in the same Docker network, enabling seamless communication via service names.

### Scenario 5: CI/CD Pipeline

**Use Docker** - Automated builds:

```yaml
# Example GitHub Actions
- name: Build Docker images
  run: docker-compose build

- name: Run tests in containers
  run: docker-compose up -d && npm test
```

**Why?** Consistent build environment, reproducible builds.

## Docker Files in Project

### 1. `Dockerfile` (Kenchi Services)

- **Location**: `/kenchi/Dockerfile`
- **Purpose**: Builds production images for API, Slack bot, and GitHub app services
- **Usage**: `docker build` or `docker-compose build`

### 2. `docker-compose.yml` (All Services)

- **Location**: `/kenchi/docker-compose.yml`
- **Purpose**: Orchestrates all services together (API, Slack Bot, GitHub App, PostgreSQL)
- **Usage**: `docker compose up -d`
- **Services**: All run in the same Docker network (`kenchi_default`) for seamless communication

## Quick Reference

### Development Workflow

```bash
# 1. Local development (NO Docker for services)
npm run dev:api
npm run dev:slack-bot
npm run dev:github-app

# 2. Testing with Docker Compose (Recommended for full stack)
docker compose up -d          # Start all services
npm test                      # Run tests

# 3. Production (YES Docker)
docker compose build
docker compose up -d
```

### When Each Approach is Best

| Task                      | Use Docker? | Command                |
| ------------------------- | ----------- | ---------------------- |
| Local development         | ❌ No       | `npm run dev:*`        |
| Running unit tests        | ❌ No       | `npm test`             |
| Running integration tests | ❌ No       | `npm run test:*`       |
| Full stack testing        | ✅ Yes      | `docker compose up -d` |
| Production deployment     | ✅ Yes      | `docker compose up -d` |
| CI/CD builds              | ✅ Yes      | `docker compose build` |
| Staging environment       | ✅ Yes      | `docker compose up -d` |

## Summary

**Docker Compose is used for:**

1. **Production deployments** - All services containerized
2. **Database** - PostgreSQL with pgvector runs in Docker
3. **Service communication** - Services communicate via Docker service names (api, slack-bot, etc.)
4. **CI/CD pipelines** - Automated builds and deployments
5. **Consistent environments** - Same setup across different machines
6. **Full stack testing** - Test complete workflow with all services

**Docker is NOT used for:**

1. **Local development** (use `npm run dev:*` for faster iteration)
2. **Unit/integration testing** (use local services for faster tests)
3. **Quick prototyping** (use npm directly)

**Key Benefit**: All services run in the same Docker network, enabling seamless communication using service names (e.g., `http://api:3000`, `http://slack-bot:3001`). This eliminates connection issues and makes the setup production-ready.

The project supports both approaches - use Docker Compose for production/full stack testing, and local development for faster iteration!
