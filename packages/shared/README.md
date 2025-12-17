# Shared Package

This package contains shared utilities, types, and integrations used across all services.

## Components

### Config (`src/config.ts`)
Centralized configuration loader that reads environment variables using `dotenv`. All services should import from this module instead of reading `process.env` directly. Provides a typed `Config` interface.

### OpenAI Client (`src/openaiClient.ts`)
Stub implementation for OpenAI API integration. Currently returns placeholder responses. TODO: Implement actual API calls.

### Vector Store (`src/vectorStore.ts`)
Interface and in-memory placeholder for vector database operations. Supports document embedding and similarity search. TODO: Replace with real vector DB (Postgres + pgvector or Chroma).

### Safety Helpers (`src/safety.ts`)
Confidence scoring and validation helpers to ensure LLM outputs are validated before use. TODO: Implement real confidence scoring logic.

### Logger (`src/logger.ts`)
Structured logging utility with JSON output. Supports different log levels (DEBUG, INFO, WARN, ERROR) and service-specific loggers.

### Error Handling (`src/errors.ts`)
Custom error classes for better error handling: `AppError`, `ValidationError`, `AuthenticationError`, `NotFoundError`, `ExternalServiceError`, `LLMError`.

### Middleware (`src/middleware.ts`)
Express middleware utilities: error handler, async handler wrapper, and request logger.

### Validation (`src/validation.ts`)
Request validation middleware with common validators (required, string, number, email, minLength, maxLength, oneOf).

### Rate Limiting (`src/rateLimit.ts`)
In-memory rate limiting middleware. Configurable windows and limits per IP address.

### Types (`src/types.ts`)
Common TypeScript interfaces: `LLMAnalysisResult`, `WebhookEvent`, `CIFailureEvent`, `SlackMessageEvent`, `GitHubPREvent`.

## Usage

```typescript
import { config, OpenAIClient, confidenceScore, logger, createLogger } from '@kenchi/shared';

const client = new OpenAIClient();
const analysis = await client.generateAnalysis('Analyze this error...');
const confidence = confidenceScore(analysis);

// Use structured logging
const serviceLogger = createLogger('my-service');
serviceLogger.info('Operation completed', { userId: '123' });
```

## TODO

- [ ] Implement actual OpenAI API integration
- [ ] Replace in-memory vector store with real database
- [ ] Implement real confidence scoring
- [ ] Add more comprehensive unit tests

## Safety Notes

**IMPORTANT**: The LLM provides analysis and suggestions only. All actual decisions and side-effects are handled by deterministic code after validation. Never execute LLM outputs directly.

