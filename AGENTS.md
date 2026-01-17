# Codex Agent Instructions for Kenchi

## Project Context

TypeScript monorepo for an AI-driven DevOps assistant. Strict separation of concerns with shared package for all common functionality.

## Critical Rules

### Zero Duplication Policy

**Before writing ANY code:**

1. Check `packages/shared/src/index.ts` for existing exports
2. Search codebase for similar functionality
3. If it exists, import from `@kenchi/shared`
4. If it doesn't exist and is reusable, add to shared package first

**Before creating ANY new file:**

1. Search for existing files with similar purpose
2. Extend existing files rather than creating new parallel ones
3. Never create a second file for the same concern

**Decision Rules:**

- Used in 2+ services → shared
- Domain invariant (logger, errors, config) → shared
- Integration adapter (Slack/GitHub-specific) → service

### Required Imports from `@kenchi/shared`

Always import these from `@kenchi/shared`, never create duplicates:

- **Config**: `config`, `Config`
- **Logging**: `logger`, `createLogger`, `LogLevel`
- **Errors**: `AppError`, `ValidationError`, `AuthenticationError`, `NotFoundError`, `ExternalServiceError`, `LLMError`, `isAppError`, `getErrorMessage`
- **Middleware**: `errorHandler`, `asyncHandler`, `requestLogger`
- **Validation**: `validate`, `validators`, `ValidationSchema`
- **Rate Limiting**: `createRateLimiter`, `defaultRateLimiter`
- **AI/ML**: `OpenAIClient`
- **Types**: `LLMAnalysisResult`, `WebhookEvent`, `CIFailureEvent`, `SlackMessageEvent`, `GitHubPREvent`

## Monorepo Structure

```
kenchi/
├── packages/shared/     # ALL shared code goes here
│   └── src/
│       ├── index.ts     # Check this FIRST for available exports
├── services/            # Service-specific code ONLY
│   ├── api/
│   ├── slack-bot/
│   └── github-app/
```

## TypeScript Standards

- **Explicit types** on function parameters and returns
- **Use `unknown`** instead of `any`, with type guards
- **Use `readonly`** for immutable data
- **Separate imports**: `import type { X }` for types, `import { Y }` for values
- **Never use `any`** - defeats type safety

## Error Handling

### Use Custom Error Classes

| Error Class            | HTTP Code | Use Case                              |
| ---------------------- | --------- | ------------------------------------- |
| `ValidationError`      | 400       | Invalid input, malformed data         |
| `AuthenticationError`  | 401       | Missing or invalid credentials        |
| `NotFoundError`        | 404       | Resource doesn't exist                |
| `ExternalServiceError` | 502       | External API failures (GitHub, Slack) |
| `LLMError`             | 502       | OpenAI-specific failures              |

```typescript
// WRONG
throw new Error("Tenant not found");

// CORRECT
throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
```

### Error Message Extraction

Always use `getErrorMessage()`:

```typescript
// WRONG
logger.error("Failed", { error: error instanceof Error ? error.message : "Unknown" });

// CORRECT
import { getErrorMessage } from "@kenchi/shared";
logger.error("Failed", { error: getErrorMessage(error) });
```

### Never Have Empty Catch Blocks

```typescript
// WRONG
try { ... } catch { }

// CORRECT
try { ... } catch (error) {
  logger.error("Operation failed", { error: getErrorMessage(error) });
}
```

## Logging

Always use structured logging from `@kenchi/shared`:

```typescript
// WRONG
console.log("Something happened");

// CORRECT
import { createLogger } from "@kenchi/shared";
const logger = createLogger("service-name");
logger.info("Something happened", { context: "value" });
```

## Code Style

### Naming Conventions

- **Variables**: descriptive (`userEmailAddress` not `ue`)
- **Functions**: verb + noun (`validateUserEmail`, `fetchUserById`)
- **Booleans**: `is/has/should/can` prefix
- **Constants**: `UPPER_SNAKE_CASE`
- **Callback parameters**: descriptive names, never single letters

```typescript
// WRONG
failures.map((f) => f.checkName);
items.reduce((acc, i) => acc + i.value, 0);

// CORRECT
failures.map((failure) => failure.checkName);
items.reduce((accumulator, item) => accumulator + item.value, 0);
```

### Prefer Functional Patterns

Replace loops with array methods:

```typescript
// WRONG
for (const item of items) {
  if (item.valid) results.push(item);
}

// CORRECT
const results = items.filter((item) => item.valid);
```

Replace if-else chains with lookup tables:

```typescript
// WRONG
if (range === "low") return "block";
if (range === "medium") return "approve";

// CORRECT
const RANGE_HANDLERS: Record<string, string> = {
  low: "block",
  medium: "approve",
};
return RANGE_HANDLERS[range];
```

### Async Patterns

- Always use async/await, not Promise chains
- Use `Promise.all()` for parallel independent operations

```typescript
// CORRECT - Parallel
const [user, profile] = await Promise.all([fetchUser(), fetchProfile()]);

// WRONG - Sequential (slow)
const user = await fetchUser();
const profile = await fetchProfile();
```

## Module Size Limits

- Utility: 50-150 lines
- Service/Handler: 150-300 lines
- **Maximum**: 500 lines - split if larger

## Testing

- Write tests for all new functionality
- Use descriptive test names: `should validate event before processing`
- Use AAA pattern: Arrange, Act, Assert
- Use type-safe mocks: `jest.Mocked<Logger>`

## Security

- Validate all inputs with type guards
- Sanitize user input
- Never commit secrets - use environment variables

## Before Committing Checklist

- [ ] Checked `@kenchi/shared` for existing utilities
- [ ] No code duplication
- [ ] Types explicit, no `any`
- [ ] Errors use shared classes
- [ ] Module under 500 lines
- [ ] Tests written
