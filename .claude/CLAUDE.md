# Claude AI Configuration for Kenchi

## Project Context

TypeScript monorepo for an AI-driven DevOps assistant. Strict separation of concerns with shared package for all common functionality.

## Project Guidelines

### Code Style

- **Write code like a principal engineer** - every line should reflect senior-level craftsmanship
- **Prioritize readability and maintainability** - code is read more than written
- **Include comprehensive error handling** - anticipate and handle all failure modes
- **Write meaningful comments for complex logic** - explain the "why", not the "what"

### Architecture Principles

- **Follow SOLID principles**:
  - Single Responsibility: one reason to change per module
  - Open/Closed: extend behavior without modifying existing code
  - Liskov Substitution: subtypes must be substitutable
  - Interface Segregation: prefer small, focused interfaces
  - Dependency Inversion: depend on abstractions, not concretions
- **Prefer composition over inheritance** - build complex behavior from simple pieces
- **Keep functions small and focused** - each function does one thing well

### Testing

- **Write tests for all new functionality** - no untested code in production
- **Aim for high coverage on critical paths** - prioritize business logic and error handling

### Code Standards

- **Follow engineering principles** in `docs/engineering-standards.md`
- **Write production-quality code** with proper error handling, logging, and observability
- **Use structured logging** - always use logger from `@kenchi/shared`, never `console.*`
- **Handle all error paths** - no empty catch blocks, always log or rethrow
- **Reference tickets in TODOs** - format: `// TODO: [#123] description`

## Monorepo Structure

```
kenchi/
├── packages/shared/     # ALL shared code goes here
│   └── src/
│       ├── index.ts     # Check this FIRST for available exports
│       ├── config.ts, logger.ts, errors.ts, middleware.ts, validation.ts, types.ts
├── services/            # Service-specific code ONLY
│   ├── api/
│   ├── slack-bot/
│   └── github-app/
└── docs/                # Documentation
```

## Zero Duplication Policy

**Before writing ANY code:**

1. Check `packages/shared/src/index.ts` for existing exports
2. Search codebase for similar functionality
3. If it exists, import from `@kenchi/shared`
4. If it doesn't exist and is reusable, add to shared package first

**Before creating ANY new file:**

1. Search for existing files with similar purpose
2. Extend existing files rather than creating new parallel ones
3. Never create a second file for the same concern (e.g., two formatters, two validators)
4. If similar file exists, add your function there instead
5. Consolidate related functionality into single, focused files

**Decision Rules:**

- Used in 2+ services → shared
- Domain invariant (logger, errors, config) → shared
- Integration adapter (Slack/GitHub-specific) → service
- Tiny one-off helper → service

## Available Shared Utilities

**Always import from `@kenchi/shared`:**

- **Config**: `config`, `Config`
- **Logging**: `logger`, `createLogger`, `LogLevel`
- **Errors**: `AppError`, `ValidationError`, `AuthenticationError`, `NotFoundError`, `ExternalServiceError`, `LLMError`, `isAppError`
- **Middleware**: `errorHandler`, `asyncHandler`, `requestLogger`
- **Validation**: `validate`, `validators`, `ValidationSchema`
- **Rate Limiting**: `createRateLimiter`, `defaultRateLimiter`
- **AI/ML**: `OpenAIClient`, `VectorStore`, `InMemoryVectorStore`
- **Safety**: `confidenceScore`, `shouldActOnResult`
- **Types**: `LLMAnalysisResult`, `WebhookEvent`, `CIFailureEvent`, `SlackMessageEvent`, `GitHubPREvent`

## Code Patterns

```typescript
// ✅ CORRECT
import { createLogger, config, errorHandler } from '@kenchi/shared';
import type { WebhookEvent } from '@kenchi/shared';
const logger = createLogger('api');

// ❌ WRONG - Never do these
const logger = { info: () => {}, error: () => {} };  // Hand-rolled logger
class ValidationError extends Error { ... }          // Duplicate error class
interface WebhookEvent { ... }                       // Duplicate type
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;   // Constants in wrong place
```

## File Organization

**Shared Package** (`packages/shared/src/`):

- All utilities, helpers, formatters, middleware, clients
- Cross-service types (events, core domain, public DTOs)
- **ALL constants/enums** in `constants.ts`

**Services** (`services/*/src/`):

- Entry point (`index.ts`), routes, handlers
- Service-specific business logic and integrations
- Integration-specific types only

## Constants Rule

**ALL constants must be in `packages/shared/src/constants.ts`:**

- Regex patterns, arrays, Sets, Maps, numeric thresholds
- Configuration objects, string constants
- Use `as const` for immutability

---

## TypeScript Standards

### Types

- **Explicit types** on function parameters and returns
- **Use `unknown`** instead of `any`, with type guards
- **Use `readonly`** for immutable data
- **Discriminated unions** for event types with `type` field
- **Separate imports**: `import type { X }` for types, `import { Y }` for values

### Type Guards

```typescript
function isWebhookEvent(data: unknown): data is WebhookEvent {
  return typeof data === "object" && data !== null && "type" in data;
}
```

### Avoid

- `any` type - defeats type safety
- Unnecessary type assertions (`as`)
- Inline complex types - use type aliases

---

## Error Handling

### Error Classes

**Always use custom error classes from `@kenchi/shared`:**

| Error Class               | HTTP Code | Use Case                              |
| ------------------------- | --------- | ------------------------------------- |
| `ValidationError`         | 400       | Invalid input, malformed data         |
| `AuthenticationError`     | 401       | Missing or invalid credentials        |
| `AuthorizationError`      | 403       | Insufficient permissions              |
| `NotFoundError`           | 404       | Resource doesn't exist                |
| `ExternalServiceError`    | 502       | External API failures (GitHub, Slack) |
| `LLMError`                | 502       | OpenAI-specific failures              |
| `RateLimitError`          | 429       | Rate limiting                         |
| `CircuitBreakerOpenError` | 502       | Circuit breaker open state            |

```typescript
// ❌ WRONG - Generic Error
throw new Error("Tenant not found");
throw new Error("GitHub API failed");

// ✅ CORRECT - Typed errors with context
throw new NotFoundError("Tenant not found", { metadata: { tenantId } });
throw new ExternalServiceError("github", `API error: ${status}`);
```

### Error Message Extraction

**Always use `getErrorMessage()` for extracting error messages:**

```typescript
// ❌ WRONG - Manual type checking
logger.error("Failed", { error: error instanceof Error ? error.message : "Unknown" });

// ✅ CORRECT - Use shared utility
import { getErrorMessage } from "@kenchi/shared";
logger.error("Failed", { error: getErrorMessage(error) });
```

### Promise Error Handling

**Always handle promise rejections:**

```typescript
// ❌ WRONG - Unhandled promise rejection
somePromise.then(() => { ... });

// ✅ CORRECT - Handle errors
somePromise.then(() => { ... }).catch((error) => {
  logger.error("Operation failed", { error: getErrorMessage(error) });
});

// ✅ BETTER - Use async/await with try-catch
try {
  await somePromise;
} catch (error) {
  logger.error("Operation failed", { error: getErrorMessage(error) });
}
```

### Catch Blocks

**Never have empty catch blocks - always log or rethrow:**

```typescript
// ❌ WRONG - Silent failure
try { ... } catch { }
try { ... } catch (error) { }

// ✅ CORRECT - Log the error
try { ... } catch (error) {
  logger.error("Operation failed", { error: getErrorMessage(error) });
}

// ✅ CORRECT - Rethrow with context
try { ... } catch (error) {
  throw new ExternalServiceError("github", wrapError("Failed to fetch PR", error));
}

// ✅ ACCEPTABLE - Health checks returning boolean (intentionally silent)
const isHealthy = async (): Promise<boolean> => {
  try {
    await ping();
    return true;
  } catch {
    return false;  // Intentionally silent - health check pattern
  }
};
```

### Error Context

**Include relevant context in errors:**

```typescript
throw new ValidationError("Invalid input", {
  operation: "createUser",
  metadata: { field: "email", value: input.email },
});

throw new ExternalServiceError("slack", "Failed to post message", {
  metadata: { channel, teamId },
  retryable: true,
});
```

### Result Types

**Use Result types for expected errors:**

```typescript
type Result<T, E = string> = { success: true; data: T } | { success: false; error: E };

const parseConfig = (input: unknown): Result<Config> => {
  if (!isValidConfig(input)) {
    return { success: false, error: "Invalid configuration" };
  }
  return { success: true, data: input as Config };
};
```

### Middleware Error Handling

- Let `errorHandler` middleware handle unexpected errors
- Use `asyncHandler` wrapper for async route handlers
- Use Map/Set for O(1) error lookups instead of if-else chains

---

## Async Patterns

- **Always use async/await**, not Promise chains
- **Parallel execution** with `Promise.all()` for independent operations
- **Try-finally** for resource cleanup
- **AbortController** for cancellable operations

```typescript
// ✅ Parallel
const [user, profile] = await Promise.all([fetchUser(), fetchProfile()]);

// ❌ Sequential (slow)
const user = await fetchUser();
const profile = await fetchProfile();
```

---

## Functions & Classes

- **Arrow functions** by default
- **Function declarations** for overloads, generators, type guards
- **Small, focused functions** - single responsibility
- **Pure functions** when possible - no side effects
- **Composition over inheritance**
- **Dependency injection** - pass dependencies to constructors

---

## Performance Rules

### Data Structures

- **Set** for membership testing (O(1) vs O(n) for arrays)
- **Map** for key-value lookups
- **Pre-compute** lookup structures once, reuse

### Optimization

- **Early exits** - return as soon as possible
- **Batch operations** - avoid N+1 queries
- **Lazy evaluation** - defer expensive operations
- **Streaming** for large data - don't load everything into memory
- **Parallelize** independent async operations

### Avoid

- Nested loops when better data structures work
- Repeated computations (toLowerCase, regex) in loops
- `Array.from(set).some()` - iterate Set directly
- Recreating constants/patterns in methods

```typescript
// ✅ Pre-compiled regex at class level
private static readonly PATTERN = /dangerous/i;

// ❌ Recreated every call
private validate() { const pattern = /dangerous/i; }
```

### Code Quality Optimization

**Minimize conditional statements and loops:**

- **Replace `for` loops with functional array methods**: Use `forEach`, `map`, `filter`, `some`, `find`, `reduce` instead of imperative loops
- **Replace multiple `if` statements with lookup tables**: Use Maps, Records, or arrays with `find()` for decision logic
- **Use handler patterns**: Replace if-else chains with handler lookup tables
- **Prefer functional patterns**: Use `?.` (optional chaining), `??` (nullish coalescing), and array methods

```typescript
// ❌ Multiple if statements
if (range === "very_low") return "block";
if (range === "low") return "require_approval";
if (range === "medium") return "require_approval";
return "auto_approve";

// ✅ Lookup table with handler pattern
const RANGE_HANDLERS: Record<ConfidenceRange, Handler> = {
  very_low: handleVeryLow,
  low: handleLow,
  medium: handleMedium,
  high: handleHigh,
} as const;
return RANGE_HANDLERS[range](...);

// ❌ For loop
for (const item of items) {
  if (item.valid) {
    results.push(item);
  }
}

// ✅ Functional array method
const results = items.filter(item => item.valid);

// ❌ Multiple if statements
if (error.status === 400) return new Error("Bad request");
if (error.status === 401) return new Error("Unauthorized");
if (error.status === 429) return new Error("Rate limited");
return new Error("Unknown error");

// ✅ Handler array with find()
const errorHandlers = [
  { condition: (e) => e.status === 400, handler: () => new Error("Bad request") },
  { condition: (e) => e.status === 401, handler: () => new Error("Unauthorized") },
  { condition: (e) => e.status === 429, handler: () => new Error("Rate limited") },
] as const;
const matched = errorHandlers.find(({ condition }) => condition(error));
return matched?.handler() ?? new Error("Unknown error");
```

**Avoid array mutation with push:**

- **Never use `array.push()`** - mutates the original array
- **Use spread operator** `[...existing, newItem]` to add items
- **Use `concat()`** for combining arrays
- **Return new arrays** from `map()`, `filter()`, `reduce()`
- **Build arrays declaratively** using functional patterns

```typescript
// ❌ Mutable pattern with push
const results: string[] = [];
for (const item of items) {
  if (item.valid) {
    results.push(item.name);
  }
}

// ✅ Immutable functional pattern
const results = items.filter((item) => item.valid).map((item) => item.name);

// ❌ Building array with push in reduce
const grouped = items.reduce((accumulator, item) => {
  if (!accumulator[item.type]) {
    accumulator[item.type] = [];
  }
  accumulator[item.type].push(item); // Mutation!
  return accumulator;
}, {});

// ✅ Immutable reduce pattern
const grouped = items.reduce(
  (accumulator, item) => ({
    ...accumulator,
    [item.type]: [...(accumulator[item.type] ?? []), item],
  }),
  {} as Record<string, Item[]>
);

// ❌ Conditional push
const sections: string[] = [];
if (hasHeader) sections.push(header);
if (hasBody) sections.push(body);
if (hasFooter) sections.push(footer);

// ✅ Filter out undefined/null
const sections = [
  hasHeader ? header : null,
  hasBody ? body : null,
  hasFooter ? footer : null,
].filter((section): section is string => section !== null);

// ✅ Or use spread with conditional
const sections = [
  ...(hasHeader ? [header] : []),
  ...(hasBody ? [body] : []),
  ...(hasFooter ? [footer] : []),
];
```

**Target metrics:**

- **For loops**: 0 (use functional array methods)
- **If statements**: Minimize (use lookup tables, handler patterns, early returns)
- **While loops**: 0 (use recursion or functional patterns)
- **Array.push()**: 0 (use spread, concat, or functional methods)

---

## Security

- **Validate all inputs** with type guards
- **Sanitize user input** - trim, limit length, remove dangerous chars
- **Never commit secrets** - use environment variables
- **Validate env vars** on startup

---

## Testing

- **Descriptive test names**: `should validate event before processing`
- **AAA pattern**: Arrange, Act, Assert
- **Type-safe mocks**: `jest.Mocked<Logger>`
- **Separate unit/integration tests**

---

## Code Organization

### Module Size

- Utility: 50-150 lines
- Service/Handler: 150-300 lines
- **Maximum**: 500 lines - split if larger

### Naming

- **Variables**: descriptive (`userEmailAddress` not `ue`)
- **Functions**: verb + noun (`validateUserEmail`, `fetchUserById`)
- **Booleans**: `is/has/should/can` prefix
- **Constants**: `UPPER_SNAKE_CASE`
- **Callback parameters**: descriptive names, never single letters (applies to both array method callbacks and standalone callback functions)

```typescript
// ❌ Single-letter callback parameters in array methods
failures.map((f) => f.checkName);
annotations.filter((a) => a.level === "failure");
items.reduce((acc, item) => acc + item.value, 0);
actions.sort((a, b) => a.priority - b.priority);
thresholds.find((t) => value >= t.min);

// ✅ Descriptive callback parameters in array methods
failures.map((failure) => failure.checkName);
annotations.filter((annotation) => annotation.level === "failure");
items.reduce((accumulator, currentItem) => accumulator + currentItem.value, 0);
actions.sort((firstAction, secondAction) => firstAction.priority - secondAction.priority);
thresholds.find((threshold) => value >= threshold.min);

// ❌ Single-letter parameters in callback functions
const createFailure = (c: number): AnalyzedFailure => ({...});
const formatItem = (i: Item) => `${i.name}`;
const handleError = (e: Error) => console.log(e);

// ✅ Descriptive parameters in callback functions
const createAnalyzedFailureWithConfidence = (confidenceScore: number): AnalyzedFailure => ({...});
const formatItem = (item: Item) => `${item.name}`;
const handleError = (error: Error) => console.log(error);
```

### Structure

- One concept per file
- Group related functionality in folders
- Use index files for clean exports
- Consistent folder structure across services

---

## Separation of Concerns

### Layered Architecture

```
Routes (presentation) → Services (business logic) → Repositories (data access)
```

- **Routes**: HTTP handling, validation, delegates to services
- **Services**: Business logic only, no HTTP concerns
- **Repositories**: Data access only

### Rules

- Business logic NOT in route handlers
- Data access NOT in services (use repositories)
- Validation in separate layer
- Error handling in middleware
- Configuration in separate module
- Dependencies flow inward (routes → services → repos)
- No circular dependencies
- Services don't import other services

---

## Documentation

- **JSDoc for public APIs** with `@param`, `@returns`, `@throws`, `@example`
- **Don't over-document** - code should be self-explanatory
- **Update docs** when changing code

---

## Checklist

Before committing:

- [ ] Checked `@kenchi/shared` for existing utilities
- [ ] No code duplication
- [ ] Types explicit, no `any`
- [ ] Errors use shared classes
- [ ] Constants in `constants.ts`
- [ ] Module under 500 lines
- [ ] Functions small and focused
- [ ] Layers properly separated
- [ ] Tests written

## References

- `docs/ARCHITECTURE.md` - System architecture
- `docs/SYSTEM_ARCHITECTURE.md` - Detailed design
- `docs/DATA_MODELS.md` - Data structures
- `packages/shared/src/index.ts` - Available utilities
