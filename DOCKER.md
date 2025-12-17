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

### 2. **n8n Workflow Automation** (External Service)

Use Docker for:
- ✅ **Running n8n** - n8n is run as a Docker container
- ✅ **Workflow testing** - Testing n8n workflows requires n8n to be running
- ✅ **Workflow management** - Managing and executing automation workflows

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

**Use Docker** - n8n runs in Docker:

```bash
# Start n8n
docker-compose -f ../n8n/docker-compose.yml up

# Then test workflows
npm run test:workflow-e2e
```

**Why?** n8n is designed to run in containers, easier to manage.

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

### 2. `docker-compose.yml` (Kenchi Services)
- **Location**: `/kenchi/docker-compose.yml`
- **Purpose**: Orchestrates all three services together
- **Usage**: `docker-compose up`

### 3. `../n8n/docker-compose.yml` (n8n Service)
- **Location**: `/n8n/docker-compose.yml` (outside kenchi folder)
- **Purpose**: Runs n8n workflow automation service
- **Usage**: `docker-compose -f ../n8n/docker-compose.yml up`

## Quick Reference

### Development Workflow

```bash
# 1. Local development (NO Docker)
npm run dev:api
npm run dev:slack-bot

# 2. Testing (NO Docker for services, YES for n8n)
npm test
docker-compose -f ../n8n/docker-compose.yml up  # Only for n8n

# 3. Production (YES Docker)
docker-compose build
docker-compose up -d
```

### When Each Approach is Best

| Task | Use Docker? | Command |
|------|-------------|---------|
| Local development | ❌ No | `npm run dev:*` |
| Running unit tests | ❌ No | `npm test` |
| Running integration tests | ❌ No | `npm run test:*` |
| Testing n8n workflows | ✅ Yes (n8n only) | `docker-compose -f ../n8n/docker-compose.yml up` |
| Production deployment | ✅ Yes | `docker-compose up -d` |
| CI/CD builds | ✅ Yes | `docker-compose build` |
| Staging environment | ✅ Yes | `docker-compose up` |

## Summary

**Docker is used for:**
1. **Production deployments** of Kenchi services
2. **Running n8n** workflow automation service
3. **CI/CD pipelines** and automated testing
4. **Consistent environments** across different machines

**Docker is NOT used for:**
1. **Local development** (use `npm run dev:*`)
2. **Unit/integration testing** (use local services)
3. **Quick prototyping** (use npm directly)

The project supports both approaches - use what's most appropriate for your workflow!

