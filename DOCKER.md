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

### 2. **n8n Workflow Automation** (Included in docker-compose.yml)

Use Docker for:

- ✅ **Running n8n** - n8n runs in Docker Compose alongside other services
- ✅ **Workflow testing** - Testing n8n workflows requires n8n to be running
- ✅ **Workflow management** - Managing and executing automation workflows
- ✅ **Service communication** - n8n can communicate with services using Docker service names

## Docker Usage Scenarios

### Scenario 1: Local Development

**Don't use Docker** - Use npm directly:

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
npm run test:workflow-e2e

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

### Scenario 4: n8n Workflow Testing

**Use Docker** - All services run together:

```bash
# Start all services (including n8n)
docker compose up -d

# Then test workflows
# Access n8n at http://localhost:5678
# Import workflow and test
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
- **Purpose**: Orchestrates all services together (API, Slack Bot, GitHub App, and n8n)
- **Usage**: `docker compose up -d`
- **Services**: All run in the same Docker network (`kenchi_default`) for seamless communication

## Quick Reference

### Development Workflow

```bash
# 1. Local development (NO Docker for services, YES for n8n)
npm run dev:api
npm run dev:slack-bot
# Note: n8n still needs Docker for workflow testing

# 2. Testing with Docker Compose (Recommended)
docker compose up -d          # Start all services
npm test                      # Run tests
# Access n8n at http://localhost:5678

# 3. Production (YES Docker)
docker compose build
docker compose up -d
```

### When Each Approach is Best

| Task                      | Use Docker? | Command                               |
| ------------------------- | ----------- | ------------------------------------- |
| Local development         | ❌ No       | `npm run dev:*`                       |
| Running unit tests        | ❌ No       | `npm test`                            |
| Running integration tests | ❌ No       | `npm run test:*`                      |
| Testing n8n workflows     | ✅ Yes      | `docker compose up -d` (all services) |
| Production deployment     | ✅ Yes      | `docker compose up -d`                |
| CI/CD builds              | ✅ Yes      | `docker compose build`                |
| Staging environment       | ✅ Yes      | `docker compose up -d`                |
| Full stack testing        | ✅ Yes      | `docker compose up -d`                |

## Summary

**Docker Compose is used for:**

1. **Production deployments** - All services containerized
2. **n8n workflows** - n8n runs alongside other services in docker-compose.yml
3. **Service communication** - Services communicate via Docker service names (api, slack-bot, etc.)
4. **CI/CD pipelines** - Automated builds and deployments
5. **Consistent environments** - Same setup across different machines
6. **Full stack testing** - Test complete workflow with all services

**Docker is NOT used for:**

1. **Local development** (use `npm run dev:*` for faster iteration)
2. **Unit/integration testing** (use local services for faster tests)
3. **Quick prototyping** (use npm directly)

**Key Benefit**: All services run in the same Docker network, enabling seamless communication using service names (e.g., `http://api:3000`, `http://slack-bot:3001`). This eliminates connection issues and makes the setup production-ready.

The project supports both approaches - use Docker Compose for production/workflow testing, and local development for faster iteration!
