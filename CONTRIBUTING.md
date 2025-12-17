# Contributing to Kenchi

Thank you for your interest in contributing to Kenchi! This document provides guidelines and information for contributors.

## Development Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd kenchi
   npm install
   ```

2. **Set Up Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   npm run validate  # Verify environment setup
   ```

3. **Build Shared Package**
   ```bash
   npm run build:shared
   ```

4. **Type Checking**
   ```bash
   npm run type-check
   ```

## Development Workflow

### Making Changes

1. **Shared Package Changes**
   - Make changes in `packages/shared/src/`
   - Run `npm run build:shared` to rebuild
   - Other services will need to be rebuilt if they depend on shared

2. **Service Changes**
   - Make changes in `services/<service-name>/src/`
   - Use `npm run dev:<service-name>` for hot reload during development
   - Run `npm run build:<service-name>` for production builds

### TypeScript Guidelines

- **Always use TypeScript** - All code should be in `.ts` files
- **Use proper types** - Avoid `any` when possible
- **Export types** - Use `export type` for type-only exports
- **Type safety first** - Let TypeScript catch errors at compile time

### Code Style

- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and single-purpose

### Safety Principles

**CRITICAL**: The LLM is treated as an untrusted helper.

- ✅ LLM outputs are **analyzed and validated** by deterministic code
- ✅ LLM provides **suggestions only** - never executes commands directly
- ✅ All side-effects are handled by **deterministic code**
- ✅ Always check confidence scores before acting on LLM suggestions
- ❌ **NEVER** execute LLM outputs as code or commands

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Building

```bash
# Build everything
npm run build

# Build specific package
npm run build:shared
npm run build:api
```

### Submitting Changes

1. Create a feature branch
2. Make your changes
3. Ensure `npm run type-check` passes
4. Ensure `npm run build` succeeds
5. Submit a pull request with a clear description

## Project Structure

- `/packages/shared` - Shared utilities, types, and integrations
- `/services/api` - API service for webhooks and events
- `/services/slack-bot` - Slack bot service
- `/services/github-app` - GitHub App service
- `/n8n/workflows` - n8n workflow definitions
- `/scripts` - Development and utility scripts

## Questions?

Feel free to open an issue for questions or clarifications.

